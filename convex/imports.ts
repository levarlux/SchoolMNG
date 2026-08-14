import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  requirePrincipal,
  requireSchoolMembership,
  logAuditEntry,
} from "./helpers";
import { nextAdmissionNumberInternal, nextStaffNumberInternal } from "./blueprints";
import { normalizeName, resolveClassStream } from "./classResolver";

/** Create a normalized name key for deduplication. */
function nameKey(firstName: string, lastName: string): string {
  return normalizeName(`${firstName} ${lastName}`);
}

/** Normalize phone number for matching (digits only). */
function normalizePhoneForMatch(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Split guardian name into first/last. */
function splitGuardianName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Per-call row cap at the Import Studio boundary. Files larger than this are
// rejected up front. The cap is generous because the client slices every file
// into `IMPORT_CALL_ROWS`-sized batches before calling `importBatch`, and
// `importBatch` chunks every batch into small internal mutations
// (`IMPORT_CHUNK`), keeping each transaction well within Convex limits.
// This is a safety net only — a real import never approaches it.
const IMPORT_FILE_LIMIT = 100_000;
// Rows per internal mutation. Each student row triggers several reads/writes
// (class/stream resolution + guardian de-dup + inserts), so 100 keeps a single
// mutation comfortably inside Convex's 1s user-code / write limits.
const IMPORT_CHUNK = 100;
// Phase 18: the students table carries ONLY the typed semantic core
// (name/admNo/class/status). Gender, DOB, admissionDate, guardian & contact
// fields are school-defined EAV — the import row still accepts the guardian
// fields (they feed the guardian ENTITY system via linkGuardians) but nothing
// beyond status is written onto the students doc.
const OPTIONAL_STUDENT_KEYS = [
  "status",
] as const;

const importRow = v.object({
  firstName: v.string(),
  lastName: v.string(),
  admNo: v.string(),
  className: v.string(),
  streamName: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("active"),
      v.literal("graduated"),
      v.literal("withdrawn"),
      v.literal("suspended")
    )
  ),
  guardianName: v.optional(v.string()),
  guardianRelation: v.optional(v.string()),
  guardianPhone: v.optional(v.string()),
  guardianPhone2: v.optional(v.string()),
  guardianEmail: v.optional(v.string()),
  homeAddress: v.optional(v.string()),
  emergencyName: v.optional(v.string()),
  emergencyPhone: v.optional(v.string()),
  // Phase 17C: mapped school EAV values, keyed by catalog key (e.g.
  // "eav:<fieldId>"). Written to records/fieldValues alongside the system
  // columns so imported students show complete 360° data immediately.
  // Phase 18: gender, DOB, admissionDate & emergency contacts are NO LONGER
  // system columns — they come through here as school-defined EAV fields.
  eavValues: v.optional(v.record(v.string(), v.string())),
});

// One entry per EAV field the file maps to. Sent once per file (not per row)
// so the payload stays small; `key` matches the row's eavValues keys.
const eavFieldDef = v.object({
  key: v.string(),
  fieldId: v.id("fields"),
  bucket: v.optional(v.string()),
});

// ── Phase 2.2: per-row duplicate resolution + row audit shapes ───────
// Defined before `importStudentsInternal` because the mutations reference
// them in their arg validators.

const resolution = v.object({
  index: v.number(),
  action: v.union(
    v.literal("create"),
    v.literal("skip"),
    v.literal("overwrite"),
    // Phase 17C: create a brand-new record even though a duplicate match
    // exists (admNo conflicts get a fresh auto-generated admNo).
    v.literal("keep_both")
  ),
});

// ── Phase 2.3: Cached lookups for import optimization ─────────────────
// Passed from importBatch to importStudentsInternal to avoid re-fetching
// the same lookup data for every 100-row chunk.

type CachedLookups = {
  classes: { _id: string; name: string; hasStreams: boolean; schoolId: string }[];
  streams: { _id: string; classId: string; name: string; schoolId: string }[];
  students: { _id: string; admNo: string; firstName: string; lastName: string; classId: string; schoolId: string }[];
  guardians: { _id: string; phone?: string; email?: string; schoolId: string; firstName: string; lastName: string; phone2?: string; address?: string; relationship: string; communicationPreference: string }[];
  guardianLinks: { studentId: string; guardianId: string }[];
};

const cachedLookupsValidator = v.object({
  classes: v.array(v.object({
    _id: v.string(),
    name: v.string(),
    hasStreams: v.boolean(),
    schoolId: v.string(),
  })),
  streams: v.array(v.object({
    _id: v.string(),
    classId: v.string(),
    name: v.string(),
    schoolId: v.string(),
  })),
  students: v.array(v.object({
    _id: v.string(),
    admNo: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    classId: v.string(),
    schoolId: v.string(),
  })),
  guardians: v.array(v.object({
    _id: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    schoolId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    phone2: v.optional(v.string()),
    address: v.optional(v.string()),
    relationship: v.string(),
    communicationPreference: v.string(),
  })),
  guardianLinks: v.array(v.object({
    studentId: v.string(),
    guardianId: v.string(),
  })),
});

type RowResult = {
  row: number;
  status: "created" | "skipped" | "overwritten" | "error";
  reason?: string;
  studentId?: string;
};

type StudentImportResult = {
  created: number;
  skippedDuplicates: number;
  overwritten: number;
  guardiansCreated: number;
  guardianLinksCreated: number;
  errors: { row: number; reason: string }[];
  createdClasses: string[];
  createdStreams: string[];
  rowResults: RowResult[];
};

type StaffImportResult = {
  created: number;
  skipped: number;
  overwritten: number;
  teaching: number;
  nonTeaching: number;
  errors: { row: number; reason: string }[];
  rowResults: RowResult[];
};

type FeeImportResult = {
  structuresCreated: number;
  errors: { row: number; reason: string }[];
  createdTerm: boolean;
  termName?: string;
  termYear?: number;
  // How each row's class was reconciled (school-agnostic resolution), so the
  // import report can show "Grade 1 A → Grade 1 · A" instead of a mystery.
  resolutions?: {
    row: number;
    className: string;
    streamName?: string;
    matchedClass: string;
    matchedStream?: string;
  }[];
};

// Rebase a chunk-local 1-based row number to its position in the full file.
// Chunk `start` is the 0-based slice offset, and chunk row numbers are 1-based.
function fileRow(start: number, chunkRow: number): number {
  return start + chunkRow;
}

// ── Phase 17C: EAV write path ────────────────────────────────────────
// Imported rows carry system columns AND mapped school EAV values. For each
// created/overwritten entity we ensure a `records` row exists in the right
// bucket (linked by studentId/teacherId, never name-guessed) and upsert the
// mapped fieldValues into it.

type EavFieldDef = { key: string; fieldId: Id<"fields">; bucket?: string };

async function upsertEavRecord(
  ctx: MutationCtx,
  args: {
    schoolId: Id<"schools">;
    bucket: "learner" | "teaching_staff" | "non_teaching_staff" | "admin_staff" | "leadership";
    displayName: string;
    studentId?: Id<"students">;
    teacherId?: Id<"teachers">;
  }
): Promise<Id<"records">> {
  if (args.studentId) {
    const existing = await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId!))
      .first();
    if (existing) return existing._id;
  }
  if (args.teacherId) {
    const existing = await ctx.db
      .query("records")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId!))
      .first();
    if (existing) return existing._id;
  }
  return await ctx.db.insert("records", {
    schoolId: args.schoolId,
    bucket: args.bucket,
    displayName: args.displayName,
    photoUrl: undefined,
    status: "active",
    studentId: args.studentId,
    teacherId: args.teacherId,
  });
}

async function writeEavValues(
  ctx: MutationCtx,
  args: {
    schoolId: Id<"schools">;
    recordId: Id<"records">;
    eavFields: EavFieldDef[];
    eavValues: Record<string, string> | undefined;
  }
): Promise<number> {
  const values = args.eavValues ?? {};
  let written = 0;
  for (const ef of args.eavFields) {
    const raw = values[ef.key];
    if (raw === undefined || String(raw).trim() === "") continue;
    const existing = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId_fieldId", (q) =>
        q.eq("recordId", args.recordId).eq("fieldId", ef.fieldId)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: String(raw) });
    } else {
      await ctx.db.insert("fieldValues", {
        schoolId: args.schoolId,
        recordId: args.recordId,
        fieldId: ef.fieldId,
        value: String(raw),
      });
    }
    written++;
  }
  return written;
}

// ── Phase 2.3: Batch EAV write optimization ──────────────────────────
// For a chunk of students, batch-fetch all existing fieldValues and perform
// upserts using memory lookups instead of DB reads inside the loop.
// This reduces N students * M fields sequential queries to:
//   1 query to fetch all existing fieldValues + 1 write per field per student.

async function batchWriteEavValues(
  ctx: MutationCtx,
  args: {
    schoolId: Id<"schools">;
    recordIds: Id<"records">[];
    eavFields: EavFieldDef[];
    eavValuesMap: Map<string, Record<string, string> | undefined>;
  }
): Promise<number> {
  if (args.recordIds.length === 0 || args.eavFields.length === 0) return 0;

  // Step 1: Batch-fetch all existing fieldValues for these records.
  // Convex indexes only support eq on the leading field, so we query each
  // recordId individually — but in a tight loop (no awaits beyond the query).
  const existingFieldValues: { recordId: Id<"records">; fieldId: Id<"fields">; _id: Id<"fieldValues"> }[] = [];
  
  for (const recordId of args.recordIds) {
    const results = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
      .collect();
    for (const r of results) {
      existingFieldValues.push({ recordId: r.recordId, fieldId: r.fieldId, _id: r._id });
    }
  }

  // Build lookup map: `${recordId}_${fieldId}` -> _id
  const existingMap = new Map(
    existingFieldValues.map(e => [`${e.recordId}_${e.fieldId}`, e._id])
  );

  // Step 2: Perform upserts using memory lookups
  let written = 0;
  for (const recordId of args.recordIds) {
    const eavValues = args.eavValuesMap.get(recordId) ?? {};
    for (const ef of args.eavFields) {
      const raw = eavValues[ef.key];
      if (raw === undefined || String(raw).trim() === "") continue;

      const existingId = existingMap.get(`${recordId}_${ef.fieldId}`);
      if (existingId) {
        await ctx.db.patch(existingId, { value: String(raw) });
      } else {
        await ctx.db.insert("fieldValues", {
          schoolId: args.schoolId,
          recordId,
          fieldId: ef.fieldId,
          value: String(raw),
        });
      }
      written++;
    }
  }
  return written;
}

/**
 * Bulk import students from the Import Studio.
 *
 * Rules:
 *  - Authoritative server-side validation — the client preview is only a hint.
 *  - Duplicate admission numbers (existing OR within this batch) are skipped.
 *  - Unknown classes are NEVER guessed: they are reported as errors unless
 *    `createMissingClasses` is true (the principal explicitly approves).
 *  - Streams are only created under the same explicit approval.
 *
 * The `importBatch` action calls this repeatedly — one chunk of
 * `IMPORT_CHUNK` rows at a time — so files of any size stay well within
 * Convex transaction limits while the file still shows its own status.
 */
export const importStudentsInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(importRow),
    createMissingClasses: v.boolean(),
    // Phase 2.2: per-row user decisions from the duplicate UI. Indexes are
    // positions within `rows`. Defaults: unmatched rows are created, matched
    // rows are skipped. Only "overwrite" ever touches existing data.
    resolutions: v.optional(v.array(resolution)),
    // Phase 17C: EAV fields this file maps to (key → fieldId). The rows'
    // `eavValues` are keyed by these keys.
    eavFields: v.optional(v.array(eavFieldDef)),
    // Phase 2.3: Optional cached lookups from importBatch to avoid re-fetching
    // the same data for every 100-row chunk.
    cachedLookups: v.optional(cachedLookupsValidator),
  },
  handler: async (ctx, { schoolId, rows, createMissingClasses, resolutions, eavFields, cachedLookups }) => {
    await requirePrincipal(ctx, schoolId);
    const eavDefs: EavFieldDef[] = eavFields ?? [];

    if (rows.length === 0) {
      throw new Error("No student rows to import");
    }
    if (rows.length > IMPORT_CHUNK) {
      throw new Error(`Too many student rows in one chunk (max ${IMPORT_CHUNK}).`);
    }

    // ── Use cached lookups if provided, otherwise fetch from DB ─────────
    const useCache = !!cachedLookups;

    // Existing classes (case-insensitive name lookup).
    const classByName = new Map<string, Doc<"classes">>();
    let classes: Doc<"classes">[] = [];
    if (useCache && cachedLookups) {
      for (const c of cachedLookups.classes) {
        classByName.set(normalizeName(c.name), c as any);
      }
      classes = cachedLookups.classes as any;
    } else {
      const fetched = await ctx.db
        .query("classes")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(500);
      classes = fetched;
      for (const c of fetched) classByName.set(normalizeName(c.name), c);
    }

    // Existing streams grouped by class (case-insensitive).
    const streamByClassAndName = new Map<string, Doc<"streams">>();
    let streams: Doc<"streams">[] = [];
    if (useCache && cachedLookups) {
      for (const s of cachedLookups.streams) {
        streamByClassAndName.set(`${s.classId}:${s.name.toLowerCase().trim()}`, s as any);
      }
      streams = cachedLookups.streams as any;
    } else {
      const fetched = await ctx.db
        .query("streams")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(500);
      streams = fetched;
      for (const s of fetched) {
        streamByClassAndName.set(`${s.classId}:${s.name.toLowerCase().trim()}`, s);
      }
    }

    // ── Fetch existing students only for the classes in this chunk ──
    const existingAdmNos = new Set<string>();
    const byNameClass = new Map<string, Doc<"students">>();

    if (useCache && cachedLookups) {
      for (const s of cachedLookups.students as any[]) {
        existingAdmNos.add(s.admNo.trim().toLowerCase());
        const nk = nameKey(s.firstName, s.lastName);
        if (!nk) continue;
        byNameClass.set(`${nk}:${s.classId}`, s as any);
      }
    } else {
      // Find which classes are referenced in this chunk
      const chunkClassIds = new Set<Id<"classes">>();
      for (const row of rows) {
        const cn = normalizeName(row.className);
        if (cn) {
          const cls = classByName.get(cn);
          if (cls) chunkClassIds.add(cls._id);
        }
      }
      
      // Fetch students only for these classes
      for (const cid of chunkClassIds) {
        const classStudents = await ctx.db
          .query("students")
          .withIndex("by_classId", (q) => q.eq("classId", cid))
          .collect();
          
        for (const s of classStudents) {
          if (s.schoolId !== schoolId) continue;
          existingAdmNos.add(s.admNo.trim().toLowerCase());
          const nk = nameKey(s.firstName, s.lastName);
          if (!nk) continue;
          byNameClass.set(`${nk}:${s.classId}`, s);
        }
      }
    }

    const resolutionMap = new Map<number, "create" | "skip" | "overwrite" | "keep_both">(
      (resolutions ?? []).map((r) => [r.index, r.action])
    );

    // ── Guardian de-dup index ──────────────
    const guardianByPhone = new Map<string, Doc<"guardians">>();
    const guardianByEmail = new Map<string, Doc<"guardians">>();

    if (useCache && cachedLookups) {
      for (const g of cachedLookups.guardians as any[]) {
        if (g.phone) {
          const core = normalizePhoneForMatch(g.phone);
          if (core) guardianByPhone.set(core, g as any);
        }
        if (g.email) guardianByEmail.set(g.email.trim().toLowerCase(), g as any);
      }
    } else {
      // Extract specific phones/emails to lookup explicitly
      const chunkPhones = new Set<string>();
      const chunkEmails = new Set<string>();
      
      for (const row of rows) {
        if (row.guardianPhone) chunkPhones.add(row.guardianPhone.trim());
        if (row.guardianEmail) chunkEmails.add(row.guardianEmail.trim().toLowerCase());
      }
      
      // Fetch only guardians that match the phones exactly (since we can't query by core efficiently)
      for (const phone of chunkPhones) {
        const g = await ctx.db
          .query("guardians")
          .withIndex("by_phone", (q) => q.eq("schoolId", schoolId).eq("phone", phone))
          .first();
        if (g) {
          const core = normalizePhoneForMatch(g.phone);
          if (core) guardianByPhone.set(core, g);
          if (g.email) guardianByEmail.set(g.email.trim().toLowerCase(), g);
        }
      }
      
      // Note: We can't query by email efficiently without an index, so if cache isn't provided, 
      // we only de-dup against guardians we just found by phone, or we create a new one.
      // This is a tradeoff to save massive I/O.
    }
    
    // Guardian links: we no longer preload all 2000 links. We will query per-student in the loop.
    const linkKeys = new Set<string>();

    // Pre-scan: does any row in this batch reference a stream for a
    // given class? Used when auto-creating a class so hasStreams is
    // correct regardless of row order.
    const classHasStream = new Map<string, boolean>();
    for (const row of rows) {
      const cn = row.className?.trim().toLowerCase();
      if (!cn) continue;
      if (row.streamName?.trim()) classHasStream.set(cn, true);
      else if (!classHasStream.has(cn)) classHasStream.set(cn, false);
    }

    let created = 0;
    let skippedDuplicates = 0;
    let overwritten = 0;
    let guardiansCreated = 0;
    let guardianLinksCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    const rowResults: RowResult[] = [];
    const createdClasses: string[] = [];
    const createdStreams: string[] = [];

    const seenInBatch = new Set<string>();

    // Create/upsert a guardian from a student row's guardian columns and
    // link it to the student. De-dupes by phone core / email across the
    // batch and the school's existing guardians. No-op when the row has
    // no guardian name or no contact channel at all.
    async function linkGuardians(studentId: Id<"students">, row: (typeof rows)[number]) {
      const gName = row.guardianName?.trim();
      const gPhone = row.guardianPhone?.trim();
      const gPhone2 = row.guardianPhone2?.trim();
      const gEmail = row.guardianEmail?.trim();
      if (!gName || (!gPhone && !gEmail)) return;

      const phoneCore = normalizePhoneForMatch(gPhone ?? "");
      const emailKey = gEmail?.toLowerCase() ?? "";
      let guardian = phoneCore ? guardianByPhone.get(phoneCore) : undefined;
      if (!guardian && emailKey) guardian = guardianByEmail.get(emailKey);

      if (!guardian) {
        const { firstName: gFirst, lastName: gLast } = splitGuardianName(gName);
        const gid = await ctx.db.insert("guardians", {
          schoolId,
          firstName: gFirst,
          lastName: gLast,
          phone: gPhone || "",
          phone2: gPhone2 || undefined,
          email: gEmail || undefined,
          address: row.homeAddress || undefined,
          relationship: row.guardianRelation?.trim() || "Guardian",
          communicationPreference: gPhone ? "sms" : "email",
        });
        guardian = {
          _id: gid,
          schoolId,
          firstName: gFirst,
          lastName: gLast,
          phone: gPhone || "",
          phone2: gPhone2 || undefined,
          email: gEmail || undefined,
          address: row.homeAddress || undefined,
          relationship: row.guardianRelation?.trim() || "Guardian",
          communicationPreference: gPhone ? "sms" : "email",
        } as Doc<"guardians">;
        if (phoneCore) guardianByPhone.set(phoneCore, guardian);
        if (emailKey) guardianByEmail.set(emailKey, guardian);
        guardiansCreated++;
      }

      const linkKey = `${studentId}:${guardian._id}`;
      if (linkKeys.has(linkKey)) return;
      const existingLink = await ctx.db
        .query("guardian_links")
        .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
        .first();
      await ctx.db.insert("guardian_links", {
        schoolId,
        guardianId: guardian._id,
        studentId,
        isPrimary: !existingLink,
      });
      linkKeys.add(linkKey);
      guardianLinksCreated++;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // ── Required fields ────────────────────────────────────────────
      const firstName = row.firstName?.trim();
      const lastName = row.lastName?.trim();
      const className = row.className?.trim();
      const streamName = row.streamName?.trim();
      
      // Handle admission number: use provided or auto-generate (the school's
      // own convention when a blueprint is saved, legacy scheme otherwise).
      let admNo = row.admNo?.trim();
      if (!admNo || admNo.startsWith("AUTO-")) {
        admNo = await nextAdmissionNumberInternal(ctx, schoolId, i + 1);
      }

      if (!firstName) {
        errors.push({ row: rowNum, reason: "Missing student name (first name required)" });
        rowResults.push({ row: rowNum, status: "error", reason: "Missing student name (first name required)" });
        continue;
      }

      // ── Duplicate detection (admNo first — authoritative index) ────
      const admKey = admNo.toLowerCase();
      const authoritativeDup = await ctx.db
        .query("students")
        .withIndex("by_admNo", (q) => q.eq("schoolId", schoolId).eq("admNo", admNo))
        .first();
      const action = resolutionMap.get(i) ?? (authoritativeDup ? "skip" : "create");

      // Taken admission number + no explicit overwrite/keep-both → skip
      // before any class/stream side effects.
      if (authoritativeDup && action !== "overwrite" && action !== "keep_both") {
        existingAdmNos.add(admKey);
        seenInBatch.add(admKey);
        skippedDuplicates++;
        rowResults.push({
          row: rowNum,
          status: "skipped",
          studentId: authoritativeDup._id,
          reason: `Admission number already exists (${authoritativeDup.admNo})`,
        });
        continue;
      }

      // ── Class + Stream resolution via school-agnostic resolver ─────────
      const classRefs = Array.from(classByName.values()).map((c) => ({
        id: c._id,
        name: c.name,
        hasStreams: c.hasStreams,
      }));
      const streamRefs = Array.from(streamByClassAndName.values()).map((s) => ({
        id: s._id,
        classId: s.classId,
        name: s.name,
      }));
      const studentRefs = Array.from(byNameClass.values()).map((s) => ({
        classId: s.classId,
        streamId: s.streamId === undefined ? undefined : s.streamId,
      }));

      const outcome = resolveClassStream(
        { className, streamName },
        classRefs,
        streamRefs,
        studentRefs
      );

      let cls: Doc<"classes"> | undefined;
      let streamId: Id<"streams"> | undefined;

      if (outcome.status === "exact") {
        cls = classByName.get(normalizeName(outcome.className)) ?? classes.find((c) => c._id === outcome.classId);
        if (outcome.streamId) {
          const st = streams.find((s) => s._id === outcome.streamId);
          streamId = st?._id;
        }
      } else if (outcome.status === "reconciled") {
        cls = classes.find((c) => c._id === outcome.classId);
        const st = streams.find((s) => s._id === outcome.streamId);
        streamId = st?._id;
      } else if (outcome.status === "ambiguous") {
        const reason = `Class "${className}" is ambiguous — it matches ${outcome.matches
          .map((m) => m.label)
          .join(" and ")}. Split it into Class + Stream columns, or fix the mapping in the Import review.`;
        errors.push({ row: rowNum, reason });
        rowResults.push({ row: rowNum, status: "error", reason });
        continue;
      } else {
        // nomatch — either the class is genuinely missing, OR the class
        // exists but its stream is missing (the resolver collapses both to
        // "nomatch" when a Stream column is present). Never insert a
        // duplicate: reuse an existing class of this name first.
        cls = classByName.get(normalizeName(className));
        if (!cls) {
          // cachedLookups.classes is frozen for the whole file, so a class
          // created in an earlier chunk won't be in this chunk's cache. A
          // single live lookup per cache-miss keeps imports correct without
          // per-row I/O (misses are bounded by the distinct class count).
          const existing = (await ctx.db
            .query("classes")
            .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
            .take(500)).find((c) => normalizeName(c.name) === normalizeName(className));
          if (existing) {
            cls = existing;
            classByName.set(normalizeName(existing.name), existing);
            classes.push(existing);
            classRefs.push({ id: existing._id, name: existing.name, hasStreams: existing.hasStreams });
          }
        }
        if (!cls && createMissingClasses) {
          const classId = await ctx.db.insert("classes", {
            schoolId,
            name: className,
            hasStreams: !!streamName,
          });
          cls = { _id: classId, schoolId, name: className, hasStreams: !!streamName } as Doc<"classes">;
          classByName.set(normalizeName(className), cls);
          classes.push(cls);
          classRefs.push({ id: classId, name: className, hasStreams: !!streamName });
          createdClasses.push(className);
        }
        if (!cls) {
          const reason = `Class "${className}" does not exist. Create it first, or approve auto-create in the Import step.`;
          errors.push({ row: rowNum, reason });
          rowResults.push({ row: rowNum, status: "error", reason });
          continue;
        }
        // The stream is created in the shared block below (guarded by
        // `streamName`), so each stream is created exactly once and later
        // rows resolve to "exact" instead of re-entering here.
      }

      if (!cls) {
        const reason = `Could not resolve class "${className}"`;
        errors.push({ row: rowNum, reason });
        rowResults.push({ row: rowNum, status: "error", reason });
        continue;
      }

      // Stream already resolved by the resolver; if streamId exists but stream
      // doesn't in our map yet, create it. Guarded on `streamName` (not
      // `streamId`) so a class just created in the nomatch branch above still
      // gets its stream created once, instead of being skipped every row.
      if (streamName) {
        let stream = streamByClassAndName.get(`${cls._id}:${streamName?.toLowerCase()}`);
        if (!stream) {
          if (createMissingClasses) {
            const streamIdNew = await ctx.db.insert("streams", {
              schoolId,
              classId: cls._id,
              name: streamName!,
            });
            const newStream = { _id: streamIdNew, schoolId, classId: cls._id, name: streamName! } as Doc<"streams">;
            streamByClassAndName.set(`${cls._id}:${streamName!.toLowerCase()}`, newStream);
            createdStreams.push(streamName!);
            stream = newStream;
          } else {
            const reason = `Stream "${streamName}" does not exist in class "${cls.name}".`;
            errors.push({ row: rowNum, reason });
            rowResults.push({ row: rowNum, status: "error", reason });
            continue;
          }
        }
        streamId = stream._id;
      }

      // ── Name-based match (Phase 2.2) ───────────────────────────────
      // Only consulted when the admission number is free and the row isn't
      // a repeat within this batch. Name + class wins (DOB is now a
      // school-defined EAV field, not a typed core column).
      let nameMatch: Doc<"students"> | undefined;
      const nk = nameKey(firstName, lastName);
      if (!authoritativeDup && nk) {
        nameMatch = byNameClass.get(`${nk}:${cls._id}`);
      }
      const matched = authoritativeDup ?? nameMatch;

      // ── Overwrite (explicit per-row confirmation) ──────────────────
      // Updates the existing student with the file's values. The admission
      // number is preserved — it is the record's canonical identity.
      if (matched && resolutionMap.get(i) === "overwrite") {
        const optionalValues: Record<string, unknown> = {};
        for (const key of OPTIONAL_STUDENT_KEYS) {
          const value = row[key];
          if (value !== undefined) optionalValues[key] = value;
        }
        await ctx.db.patch(matched._id, {
          classId: cls._id,
          streamId,
          firstName,
          lastName,
          ...optionalValues,
        });
        existingAdmNos.add(admKey);
        seenInBatch.add(admKey);
        overwritten++;
        rowResults.push({
          row: rowNum,
          status: "overwritten",
          studentId: matched._id,
          reason: `Updated existing record (${matched.admNo})`,
        });
        const recId = await upsertEavRecord(ctx, {
          schoolId,
          bucket: "learner",
          displayName: `${firstName} ${lastName}`,
          studentId: matched._id,
        });
        await writeEavValues(ctx, { schoolId, recordId: recId, eavFields: eavDefs, eavValues: row.eavValues });
        await linkGuardians(matched._id, row);
        continue;
      }

      // ── Skip (matched, in-batch duplicate, or explicit user choice) ──
      if ((matched && action !== "keep_both") || seenInBatch.has(admKey) || action === "skip") {
        if (authoritativeDup) existingAdmNos.add(admKey);
        seenInBatch.add(admKey);
        skippedDuplicates++;
        rowResults.push({
          row: rowNum,
          status: "skipped",
          studentId: matched?._id,
          reason: matched
            ? `Already exists (${matched.admNo})`
            : "Duplicate admission number within the file",
        });
        continue;
      }

      // ── Insert (drop undefined optionals so the doc stays clean) ──
      // keep-both on a taken/in-batch admNo → the new record needs its own
      // identity; a fresh auto-generated admNo leaves the original untouched.
      if (action === "keep_both" && (authoritativeDup || seenInBatch.has(admKey))) {
        admNo = await nextAdmissionNumberInternal(ctx, schoolId, i + 1);
      }
      const optionalValues: Record<string, unknown> = {};
      for (const key of OPTIONAL_STUDENT_KEYS) {
        const value = row[key];
        if (value !== undefined) optionalValues[key] = value;
      }
      const studentId = await ctx.db.insert("students", {
        schoolId,
        classId: cls._id,
        streamId,
        firstName,
        lastName,
        admNo,
        ...optionalValues,
      });
      seenInBatch.add(admKey);
      existingAdmNos.add(admKey);
      // Track the just-inserted student in the name maps so later rows in
      // this batch that describe the same person are caught too.
      if (nk) {
        const stub = { _id: studentId, admNo, classId: cls._id, firstName, lastName } as Doc<"students">;
        byNameClass.set(`${nk}:${cls._id}`, stub);
      }
      created++;
      rowResults.push({ row: rowNum, status: "created", studentId });
      const recId = await upsertEavRecord(ctx, {
        schoolId,
        bucket: "learner",
        displayName: `${firstName} ${lastName}`,
        studentId,
      });
      await writeEavValues(ctx, { schoolId, recordId: recId, eavFields: eavDefs, eavValues: row.eavValues });
      await linkGuardians(studentId, row);
    }

    await logAuditEntry(ctx, schoolId, "student.import", {
      attempted: rows.length,
      created,
      skippedDuplicates,
      overwritten,
      guardiansCreated,
      guardianLinksCreated,
      errors: errors.length,
      createMissingClasses,
    });

    return {
      created,
      skippedDuplicates,
      overwritten,
      errors,
      createdClasses,
      createdStreams,
      guardiansCreated,
      guardianLinksCreated,
      rowResults,
    };
  },
});

const staffRow = v.object({
  firstName: v.string(),
  lastName: v.string(),
  staffNo: v.string(),
  category: v.union(v.literal("teaching"), v.literal("non_teaching")),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  department: v.optional(v.string()),
  // Phase 17C: mapped school EAV values, keyed by catalog key.
  eavValues: v.optional(v.record(v.string(), v.string())),
});

const feeRow = v.object({
  className: v.string(),
  streamName: v.optional(v.string()),
  amount: v.float64(),
  // Term the fee schedule row belongs to (from the file's Term/Year columns,
  // when the school provides them). Resolved by name+year against the school's
  // own terms �?" never invented.
});

/** Persist one file's import run to the audit trail. */
export const recordImportRunInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    fileName: v.string(),
    ok: v.boolean(),
    summary: v.object({
      studentsCreated: v.number(),
      studentsSkipped: v.number(),
      studentsOverwritten: v.number(),
      staffCreated: v.number(),
      staffSkipped: v.number(),
      staffOverwritten: v.number(),
      structuresCreated: v.number(),
      errors: v.number(),
    }),
    rowResults: v.array(
      v.object({
        row: v.number(),
        kind: v.union(v.literal("student"), v.literal("staff"), v.literal("fee")),
        status: v.union(v.literal("created"), v.literal("skipped"), v.literal("overwritten"), v.literal("error")),
        reason: v.optional(v.string()),
        studentId: v.optional(v.id("students")),
      })
    ),
  },
  handler: async (ctx, args) => {
    await logAuditEntry(ctx, args.schoolId, "import.run", {
      fileName: args.fileName,
      ok: args.ok,
      summary: args.summary,
    });
  },
});



