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
      .take(100);
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
          .take(1000);
          
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
  // own terms — never invented.
  termName: v.optional(v.string()),
  termYear: v.optional(v.number()),
});

export const importStaffInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(staffRow),
    // Phase 2.2: per-row user decisions from the duplicate UI. Indexes are
    // positions within `rows`. Defaults: unmatched rows are created, matched
    // rows are skipped. Only "overwrite" ever touches existing data.
    resolutions: v.optional(v.array(resolution)),
    // Phase 17C: EAV fields this file maps to (key → fieldId). Staff rows
    // write to the teaching_staff / non_teaching_staff buckets.
    eavFields: v.optional(v.array(eavFieldDef)),
  },
  handler: async (ctx, { schoolId, rows, resolutions, eavFields }) => {
    await requirePrincipal(ctx, schoolId);
    const eavDefs = eavFields ?? [];

    if (rows.length === 0) throw new Error("No staff rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many staff rows in one chunk (max ${IMPORT_CHUNK}).`);

    const resolutionMap = new Map<number, "create" | "skip" | "overwrite" | "keep_both">(
      (resolutions ?? []).map((r) => [r.index, r.action])
    );

    // Existing staff by staffNo (authoritative) + name fallback.
    const existingStaff = await ctx.db
      .query("teachers")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);
    const byStaffNo = new Map<string, Doc<"teachers">>();
    const byName = new Map<string, Doc<"teachers">>();
    for (const t of existingStaff) {
      byStaffNo.set(t.staffNo.trim().toLowerCase(), t);
      const nk = nameKey(t.firstName, t.lastName);
      if (nk && !byName.has(nk)) byName.set(nk, t);
    }

    let created = 0;
    let skipped = 0;
    let overwritten = 0;
    let teaching = 0;
    let nonTeaching = 0;
    const errors: { row: number; reason: string }[] = [];
    const rowResults: RowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const firstName = row.firstName?.trim();
      const lastName = row.lastName?.trim();
      if (!firstName) {
        errors.push({ row: rowNum, reason: "Missing staff name (first name required)" });
        rowResults.push({ row: rowNum, status: "error", reason: "Missing staff name (first name required)" });
        continue;
      }

      let staffNo = row.staffNo?.trim();
      if (!staffNo || staffNo.startsWith("AUTO-")) {
        staffNo = await nextStaffNumberInternal(ctx, schoolId, i + 1);
      }
      const staffKey = staffNo.toLowerCase();
      const authoritativeDup = byStaffNo.get(staffKey);
      const action = resolutionMap.get(i) ?? (authoritativeDup ? "skip" : "create");

      // Taken staff number + no explicit overwrite/keep-both → skip before any writes.
      if (authoritativeDup && action !== "overwrite" && action !== "keep_both") {
        skipped++;
        rowResults.push({
          row: rowNum,
          status: "skipped",
          reason: `Staff number already exists (${authoritativeDup.staffNo})`,
        });
        continue;
      }

      // Name fallback only when the staff number is free.
      let matched = authoritativeDup;
      if (!matched && firstName && lastName) {
        matched = byName.get(nameKey(firstName, lastName));
      }

      // Overwrite: update the existing teacher with the file's values.
      if (matched && resolutionMap.get(i) === "overwrite") {
        const category = row.category ?? matched.category;
        await ctx.db.patch(matched._id, {
          firstName,
          lastName,
          email: row.email ?? matched.email,
          phone: row.phone ?? matched.phone,
          department: row.department ?? matched.department,
          category,
        });
        overwritten++;
        if (category === "teaching") teaching++;
        else nonTeaching++;
        rowResults.push({
          row: rowNum,
          status: "overwritten",
          reason: `Updated existing staff (${matched.staffNo})`,
        });
        const recId = await upsertEavRecord(ctx, {
          schoolId,
          bucket: (row.category ?? matched.category) === "teaching" ? "teaching_staff" : "non_teaching_staff",
          displayName: `${firstName} ${lastName}`.trim(),
          teacherId: matched._id,
        });
        await writeEavValues(ctx, { schoolId, recordId: recId, eavFields: eavDefs, eavValues: row.eavValues });
        continue;
      }

      // Skip (matched, or explicit user choice).
      if (matched || action === "skip") {
        skipped++;
        rowResults.push({
          row: rowNum,
          status: "skipped",
          reason: matched ? `Already exists (${matched.staffNo})` : "Skipped by user",
        });
        continue;
      }

      const category = row.category ?? "teaching";
      const teacherId = await ctx.db.insert("teachers", {
        schoolId,
        firstName,
        lastName,
        staffNo,
        email: row.email,
        phone: row.phone,
        department: row.department,
        category,
      });
      created++;
      if (category === "teaching") teaching++;
      else nonTeaching++;
      rowResults.push({ row: rowNum, status: "created" });
      const recId = await upsertEavRecord(ctx, {
        schoolId,
        bucket: category === "teaching" ? "teaching_staff" : "non_teaching_staff",
        displayName: `${firstName} ${lastName}`.trim(),
        teacherId,
      });
      await writeEavValues(ctx, { schoolId, recordId: recId, eavFields: eavDefs, eavValues: row.eavValues });
    }

    await logAuditEntry(ctx, schoolId, "staff.import", {
      attempted: rows.length,
      created,
      skipped,
      overwritten,
      errors: errors.length,
    });

    return { created, skipped, overwritten, teaching, nonTeaching, errors, rowResults };
  },
});

export const importFeesInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(feeRow),
    createMissingClasses: v.boolean(),
    // Term the fee schedule belongs to (from the action-level current-term
    // args, or the file's own Term/Year columns when present). Resolved by
    // name+year against the school's own terms — never invented.
    termName: v.optional(v.string()),
    termYear: v.optional(v.number()),
  },
  handler: async (ctx, { schoolId, rows, createMissingClasses, termName, termYear }) => {
    await requirePrincipal(ctx, schoolId);

    if (rows.length === 0) throw new Error("No fee rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many fee rows in one chunk (max ${IMPORT_CHUNK}).`);

    // ── Term resolution ──────────────────────────────────────────────
    // Resolve the term by name+year when the school provided one; otherwise
    // fall back to the school's current term. Creating a term is the caller's
    // job (terms are imported explicitly) — we never invent one.
    let termId: Id<"terms"> | undefined;
    let resolvedTermName = termName;
    let resolvedTermYear = termYear;
    let createdTerm = false;

    if (termName && termYear !== undefined) {
      const existing = await ctx.db
        .query("terms")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .filter((q) => q.and(q.eq(q.field("name"), termName), q.eq(q.field("year"), termYear)))
        .first();
      if (existing) termId = existing._id;
    }
    if (!termId) {
      const current = await ctx.db
        .query("terms")
        .withIndex("by_current", (q) => q.eq("schoolId", schoolId).eq("isCurrent", true))
        .first();
      if (current) {
        termId = current._id;
        resolvedTermName = current.name;
        resolvedTermYear = current.year;
      }
    }
    if (!termId) {
      const reason = "No term to attach fee structures to. Import a term first, or run the import with a current term set.";
      throw new Error(reason);
    }

    // ── Class + stream resolution (school-agnostic resolver) ─────────
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    const classByName = new Map<string, Doc<"classes">>();
    for (const c of classes) classByName.set(normalizeName(c.name), c);
    const streams = await ctx.db
      .query("streams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    const streamByClassAndName = new Map<string, Doc<"streams">>();
    for (const s of streams) streamByClassAndName.set(`${s.classId}:${s.name.toLowerCase().trim()}`, s);

    const classRefs = classes.map((c) => ({ id: c._id, name: c.name, hasStreams: c.hasStreams }));
    const streamRefs = streams.map((s) => ({ id: s._id, classId: s.classId, name: s.name }));
    // Student-derived dictionary (registry thin but students exist).
    const studentRefs: { classId: string; streamId?: string }[] = [];
    for (const row of rows) {
      const cls = classByName.get(normalizeName(row.className));
      if (!cls) continue;
      const list = await ctx.db
        .query("students")
        .withIndex("by_classId", (q) => q.eq("classId", cls._id))
        .take(1000);
      for (const s of list) {
        if (s.schoolId !== schoolId) continue;
        studentRefs.push({ classId: s.classId, streamId: s.streamId === undefined ? undefined : s.streamId });
      }
    }

    let structuresCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    const resolutions: FeeImportResult["resolutions"] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      const outcome = resolveClassStream(
        { className: row.className, streamName: row.streamName },
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
        const reason = `Class "${row.className}" is ambiguous — it matches ${outcome.matches
          .map((m) => m.label)
          .join(" and ")}. Split it into Class + Stream columns, or fix the mapping in the Import review.`;
        errors.push({ row: rowNum, reason });
        resolutions.push({ row: rowNum, className: row.className, streamName: row.streamName, matchedClass: "—", matchedStream: undefined });
        continue;
      } else {
        // nomatch — reuse an existing class of this name first.
        cls = classByName.get(normalizeName(row.className));
        if (!cls) {
          const existing = (await ctx.db
            .query("classes")
            .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
            .take(500)).find((c) => normalizeName(c.name) === normalizeName(row.className));
          if (existing) {
            cls = existing;
            classByName.set(normalizeName(existing.name), existing);
            classRefs.push({ id: existing._id, name: existing.name, hasStreams: existing.hasStreams });
          }
        }
        if (!cls && createMissingClasses) {
          const classId = await ctx.db.insert("classes", {
            schoolId,
            name: row.className,
            hasStreams: !!row.streamName,
          });
          cls = { _id: classId, schoolId, name: row.className, hasStreams: !!row.streamName } as Doc<"classes">;
          classByName.set(normalizeName(row.className), cls);
          classRefs.push({ id: classId, name: row.className, hasStreams: !!row.streamName });
        }
        if (!cls) {
          const reason = `Class "${row.className}" does not exist. Create it first, or approve auto-create in the Import step.`;
          errors.push({ row: rowNum, reason });
          resolutions.push({ row: rowNum, className: row.className, streamName: row.streamName, matchedClass: "—", matchedStream: undefined });
          continue;
        }
        // Stream, when present — create under the (possibly just-created) class.
        if (row.streamName) {
          let stream = streamByClassAndName.get(`${cls._id}:${row.streamName?.toLowerCase()}`);
          if (!stream && createMissingClasses) {
            const streamIdNew = await ctx.db.insert("streams", {
              schoolId,
              classId: cls._id,
              name: row.streamName!,
            });
            stream = { _id: streamIdNew, schoolId, classId: cls._id, name: row.streamName! } as Doc<"streams">;
            streamByClassAndName.set(`${cls._id}:${row.streamName!.toLowerCase()}`, stream);
            streamRefs.push({ id: streamIdNew, classId: cls._id, name: row.streamName! });
          }
          if (stream) streamId = stream._id;
        }
      }

      if (!cls) continue;

      // Upsert fee_structures (class + term + optional stream).
      const existing = await ctx.db
        .query("fee_structures")
        .withIndex("by_class_term", (q) => q.eq("classId", cls._id).eq("termId", termId))
        .take(20);
      const match = existing.find((e) => (e.streamId ?? null) === (streamId ?? null));
      if (match) {
        await ctx.db.patch(match._id, { amount: row.amount });
      } else {
        await ctx.db.insert("fee_structures", { schoolId, classId: cls._id, termId, streamId, amount: row.amount });
      }
      structuresCreated++;
      resolutions.push({
        row: rowNum,
        className: row.className,
        streamName: row.streamName,
        matchedClass: cls.name,
        matchedStream: streamId ? streams.find((s) => s._id === streamId)?.name : undefined,
      });
    }

    await logAuditEntry(ctx, schoolId, "feeStructure.import", {
      attempted: rows.length,
      structuresCreated,
      errors: errors.length,
    });

    return {
      structuresCreated,
      errors,
      createdTerm,
      termName: resolvedTermName,
      termYear: resolvedTermYear,
      resolutions,
    };
  },
});

/** Persist one file's import run to the audit trail. */
export const recordImportRunInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    fileName: v.string(),
    kind: v.optional(v.string()),
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
    const identity = await ctx.auth.getUserIdentity();
    const runAt = Date.now();
    // The Files history (Bulk Operations → Files) reads import_runs + the
    // per-row results expandable under each run. Status mirrors the schema
    // union: success / partial / failed (pending/in_progress reserved for a
    // resumable import, which we don't yet implement).
    const status: "success" | "partial" | "failed" = args.ok
      ? args.summary.errors > 0
        ? "partial"
        : "success"
      : "failed";
    const runId = await ctx.db.insert("import_runs", {
      schoolId: args.schoolId,
      fileName: args.fileName,
      status,
      studentsCreated: args.summary.studentsCreated,
      studentsSkipped: args.summary.studentsSkipped,
      studentsOverwritten: args.summary.studentsOverwritten,
      staffCreated: args.summary.staffCreated,
      staffSkipped: args.summary.staffSkipped,
      staffOverwritten: args.summary.staffOverwritten,
      structuresCreated: args.summary.structuresCreated,
      errors: args.summary.errors,
      ranBy: identity?.subject ?? "system",
      runAt,
      totalRows: args.rowResults.length,
      lastProcessedRow: args.rowResults.length,
      kind: args.kind,
    });
    // Persist per-row outcomes (capped to keep the mutation inside write
    // limits — row-level detail is diagnostic, the run summary is not).
    for (const rr of args.rowResults.slice(0, 2000)) {
      await ctx.db.insert("import_row_results", {
        schoolId: args.schoolId,
        runId,
        row: rr.row,
        kind: rr.kind,
        status: rr.status,
        reason: rr.reason,
        studentId: rr.studentId,
      });
    }
    await logAuditEntry(ctx, args.schoolId, "import.run", {
      fileName: args.fileName,
      ok: args.ok,
      summary: args.summary,
      runId,
    });
  },
});

// ── Public queries & mutations for the Import Studio UI ───────────

export const listImportRuns = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("import_runs")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(50);
  },
});

export const getImportRunRowResults = query({
  args: { runId: v.id("import_runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("Import run not found");
    await requireSchoolMembership(ctx, run.schoolId);
    return await ctx.db
      .query("import_row_results")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .order("asc")
      .take(5000);
  },
});

export const deleteImportRun = mutation({
  args: { id: v.id("import_runs") },
  handler: async (ctx, { id }) => {
    const run = await ctx.db.get(id);
    if (!run) throw new Error("Import run not found");
    await requireSchoolMembership(ctx, run.schoolId);
    // Delete associated row results
    const rowResults = await ctx.db
      .query("import_row_results")
      .withIndex("by_runId", (q) => q.eq("runId", id))
      .take(5000);
    for (const rr of rowResults) {
      await ctx.db.delete(rr._id);
    }
    await ctx.db.delete(id);
  },
});

// ── Internal helpers for import actions ─────────────────────────────

export const getStudentByAdmNo = internalQuery({
  args: { schoolId: v.id("schools"), admNo: v.string() },
  handler: async (ctx, { schoolId, admNo }) => {
    return await ctx.db
      .query("students")
      .withIndex("by_admNo", (q) => q.eq("schoolId", schoolId).eq("admNo", admNo))
      .first();
  },
});

export const upsertAttendance = internalMutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    studentId: v.id("students"),
    date: v.float64(),
    status: v.union(v.literal("present"), v.literal("absent"), v.literal("late"), v.literal("excused")),
    markedBy: v.string(),
  },
  handler: async (ctx, { schoolId, classId, studentId, date, status, markedBy }) => {
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_classId_and_date", (q) =>
        q.eq("classId", classId).gte("date", dayStart.getTime()).lte("date", dayEnd.getTime())
      )
      .filter((q) => q.eq(q.field("studentId"), studentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status, markedBy });
    } else {
      await ctx.db.insert("attendance", {
        schoolId, classId, studentId, date: dayStart.getTime(), status, markedBy,
      });
    }
  },
});

// ── Internal batch mutations for the catalog + payments actions ────

/** Normalize a raw payment-method string onto the fee_payments union. */
function normalizeMethod(s: string): "cash" | "mpesa" | "bank_transfer" | "other" {
  const v = (s ?? "").trim().toLowerCase();
  if (/cash|cheque|check|bank slip/.test(v)) return "cash";
  if (/mpesa|m-pesa|m pesa|safaricom|mobile money/.test(v)) return "mpesa";
  if (/bank|transfer|wire|eft|rtgs/.test(v)) return "bank_transfer";
  return "other";
}

/** Normalize a level string onto the subjects union (fallback "general"). */
function normalizeLevel(
  s: string
): "pre_primary" | "lower_primary" | "upper_primary" | "junior_secondary" | "senior_secondary" | "general" {
  const v = (s ?? "").trim().toLowerCase();
  if (/pre|kindergarten|nursery|pp1|pp2/.test(v)) return "pre_primary";
  if (/lower/.test(v)) return "lower_primary";
  if (/upper/.test(v)) return "upper_primary";
  if (/junior/.test(v)) return "junior_secondary";
  if (/senior/.test(v)) return "senior_secondary";
  return "general";
}

export const importFeePaymentsInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(
      v.object({
        admNo: v.string(),
        amount: v.number(),
        method: v.string(),
        date: v.optional(v.number()),
        reference: v.optional(v.string()),
        termName: v.optional(v.string()),
        termYear: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, { schoolId, rows }) => {
    await requirePrincipal(ctx, schoolId);
    if (rows.length === 0) throw new Error("No fee payment rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many fee payment rows in one chunk (max ${IMPORT_CHUNK}).`);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);
    const byAdmNo = new Map<string, Doc<"students">>();
    for (const s of students) byAdmNo.set(s.admNo.trim().toLowerCase(), s);

    type ResolvedTerm = { id: Id<"terms">; name: string; year: number };
    const termCache = new Map<string, ResolvedTerm | undefined>();
    const resolveTerm = async (tn?: string, ty?: number): Promise<ResolvedTerm | undefined> => {
      const key = `${tn ?? ""}|${ty ?? ""}`;
      if (termCache.has(key)) return termCache.get(key);
      let term: Doc<"terms"> | undefined;
      if (tn && ty !== undefined) {
        term = (
          await ctx.db
            .query("terms")
            .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
            .filter((q) => q.and(q.eq(q.field("name"), tn), q.eq(q.field("year"), ty)))
            .take(10)
        )[0];
      }
      if (!term) {
        const current = await ctx.db
          .query("terms")
          .withIndex("by_current", (q) => q.eq("schoolId", schoolId).eq("isCurrent", true))
          .first();
        term = current ?? undefined;
      }
      const out = term ? { id: term._id, name: term.name, year: term.year } : undefined;
      termCache.set(key, out);
      return out;
    };

    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const student = byAdmNo.get(row.admNo.trim().toLowerCase());
      if (!student) {
        errors.push({ row: rowNum, reason: `Student ${row.admNo} not found` });
        continue;
      }
      const term = await resolveTerm(row.termName, row.termYear);
      if (!term) {
        errors.push({
          row: rowNum,
          reason: "No term to attach the payment to. Import a term first, or set the current term.",
        });
        continue;
      }
      await ctx.db.insert("fee_payments", {
        schoolId,
        studentId: student._id,
        termId: term.id,
        amount: row.amount,
        method: normalizeMethod(row.method),
        reference: row.reference,
        receivedBy: "import",
        receivedAt: row.date ?? Date.now(),
      });
      created++;
    }
    await logAuditEntry(ctx, schoolId, "feePayment.import", {
      attempted: rows.length,
      created,
      errors: errors.length,
    });
    return { created, errors };
  },
});

export const importSubjectsInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({ name: v.string(), code: v.string(), level: v.string() })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    await requirePrincipal(ctx, schoolId);
    if (rows.length === 0) throw new Error("No subject rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many subject rows in one chunk (max ${IMPORT_CHUNK}).`);

    const existing = await ctx.db
      .query("subjects")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);
    const byName = new Map<string, Doc<"subjects">>();
    for (const s of existing) byName.set(normalizeName(s.name), s);

    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const key = normalizeName(row.name);
      if (!row.name.trim()) {
        errors.push({ row: rowNum, reason: "Subject name is required" });
        continue;
      }
      if (byName.has(key)) {
        errors.push({ row: rowNum, reason: `Subject "${row.name}" already exists` });
        continue;
      }
      await ctx.db.insert("subjects", {
        schoolId,
        name: row.name.trim(),
        code: row.code.trim(),
        level: normalizeLevel(row.level),
      });
      byName.set(key, null as unknown as Doc<"subjects">);
      created++;
    }
    await logAuditEntry(ctx, schoolId, "subject.import", {
      attempted: rows.length,
      created,
      errors: errors.length,
    });
    return { created, errors };
  },
});

export const importClassesInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({ className: v.string(), streamName: v.optional(v.string()) })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    await requirePrincipal(ctx, schoolId);
    if (rows.length === 0) throw new Error("No class rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many class rows in one chunk (max ${IMPORT_CHUNK}).`);

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);
    const streams = await ctx.db
      .query("streams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);
    const classByName = new Map<string, Doc<"classes">>();
    for (const c of classes) classByName.set(normalizeName(c.name), c);
    const streamByClassAndName = new Map<string, Doc<"streams">>();
    for (const s of streams) streamByClassAndName.set(`${s.classId}:${s.name.toLowerCase().trim()}`, s);

    let classesCreated = 0;
    let streamsCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      if (!row.className.trim()) {
        errors.push({ row: rowNum, reason: "Class name is required" });
        continue;
      }
      let cls = classByName.get(normalizeName(row.className));
      if (!cls) {
        const classId = await ctx.db.insert("classes", {
          schoolId,
          name: row.className.trim(),
          hasStreams: !!row.streamName,
        });
        cls = { _id: classId, schoolId, name: row.className.trim(), hasStreams: !!row.streamName } as Doc<"classes">;
        classByName.set(normalizeName(cls.name), cls);
        classesCreated++;
      } else if (!!row.streamName && !cls.hasStreams) {
        await ctx.db.patch(cls._id, { hasStreams: true });
      }
      if (row.streamName) {
        let stream = streamByClassAndName.get(`${cls._id}:${row.streamName.toLowerCase().trim()}`);
        if (!stream) {
          const streamId = await ctx.db.insert("streams", {
            schoolId,
            classId: cls._id,
            name: row.streamName.trim(),
          });
          stream = { _id: streamId, schoolId, classId: cls._id, name: row.streamName.trim() } as Doc<"streams">;
          streamByClassAndName.set(`${cls._id}:${row.streamName.toLowerCase().trim()}`, stream);
          streamsCreated++;
        }
      }
    }
    await logAuditEntry(ctx, schoolId, "class.import", {
      attempted: rows.length,
      classesCreated,
      streamsCreated,
      errors: errors.length,
    });
    return { classesCreated, streamsCreated, errors };
  },
});

export const importTermsInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(
      v.object({
        name: v.string(),
        year: v.number(),
        startDate: v.number(),
        endDate: v.number(),
      })
    ),
  },
  handler: async (ctx, { schoolId, rows }) => {
    await requirePrincipal(ctx, schoolId);
    if (rows.length === 0) throw new Error("No term rows to import");
    if (rows.length > IMPORT_CHUNK) throw new Error(`Too many term rows in one chunk (max ${IMPORT_CHUNK}).`);

    const years = await ctx.db
      .query("academicYears")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);
    const yearByLabel = new Map<string, Doc<"academicYears">>();
    for (const y of years) yearByLabel.set(y.label.trim().toLowerCase(), y);
    const termByKey = new Map<string, Doc<"terms">>();
    for (const t of terms) termByKey.set(`${t.name.toLowerCase().trim()}|${t.year}`, t);

    let termsCreated = 0;
    let academicYearsCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      if (!row.name.trim() || !(row.year > 2000)) {
        errors.push({ row: rowNum, reason: "Term name and a valid year are required" });
        continue;
      }
      if (termByKey.has(`${row.name.trim().toLowerCase()}|${row.year}`)) {
        errors.push({ row: rowNum, reason: `Term "${row.name}" ${row.year} already exists` });
        continue;
      }
      const yearLabel = String(row.year);
      let acYear = yearByLabel.get(yearLabel);
      if (!acYear) {
        const acYearId = await ctx.db.insert("academicYears", {
          schoolId,
          label: yearLabel,
          startDate: row.startDate,
          endDate: row.endDate,
          status: "upcoming",
        });
        acYear = {
          _id: acYearId,
          schoolId,
          label: yearLabel,
          startDate: row.startDate,
          endDate: row.endDate,
          status: "upcoming",
        } as Doc<"academicYears">;
        yearByLabel.set(yearLabel, acYear);
        academicYearsCreated++;
      }
      await ctx.db.insert("terms", {
        schoolId,
        academicYearId: acYear._id,
        name: row.name.trim(),
        year: row.year,
        startDate: row.startDate,
        endDate: row.endDate,
        status: "upcoming",
      });
      termByKey.set(`${row.name.trim().toLowerCase()}|${row.year}`, null as unknown as Doc<"terms">);
      termsCreated++;
    }
    await logAuditEntry(ctx, schoolId, "term.import", {
      attempted: rows.length,
      termsCreated,
      academicYearsCreated,
      errors: errors.length,
    });
    return { termsCreated, academicYearsCreated, errors };
  },
});

// ── Import Actions (public, called by Import Studio UI) ────────────
// These are stub implementations that return the expected shapes.
// The actual import logic lives in importStudentsInternal and the
// importBatch action. These stubs satisfy the frontend type references.

export const detectDuplicates = query({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      admNo: v.string(),
      className: v.string(),
    })),
    staffRows: v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      staffNo: v.string(),
    })),
  },
  handler: async (ctx, { schoolId, rows, staffRows }) => {
    await requireSchoolMembership(ctx, schoolId);

    // ── Students: admNo is authoritative; name+class is the fallback. ──
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    const classByName = new Map<string, Doc<"classes">>();
    for (const c of classes) classByName.set(normalizeName(c.name), c);
    const studentsByClass = new Map<string, Doc<"students">[]>();

    const students: {
      index: number;
      status: "new" | "duplicate" | "conflicting";
      reasons: string[];
      matched?: { id: string; name: string; admNo: string; className: string };
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const reasons: string[] = [];
      let matched: { id: string; name: string; admNo: string; className: string } | undefined;

      const admNo = row.admNo.trim();
      if (admNo) {
        const existing = await ctx.db
          .query("students")
          .withIndex("by_admNo", (q) => q.eq("schoolId", schoolId).eq("admNo", admNo))
          .first();
        if (existing) {
          matched = {
            id: existing._id,
            name: `${existing.firstName} ${existing.lastName}`.trim(),
            admNo: existing.admNo,
            className: "",
          };
          reasons.push("Admission number already exists");
        }
      }

      if (!matched && row.firstName.trim() && row.lastName.trim()) {
        const cls = classByName.get(normalizeName(row.className));
        if (cls) {
          let list = studentsByClass.get(cls._id);
          if (!list) {
            list = await ctx.db
              .query("students")
              .withIndex("by_classId", (q) => q.eq("classId", cls._id))
              .take(1000);
            studentsByClass.set(cls._id, list);
          }
          const nk = nameKey(row.firstName, row.lastName);
          const hits = list.filter((s) => s.schoolId === schoolId && nameKey(s.firstName, s.lastName) === nk);
          if (hits.length > 0) {
            const existing = hits[0];
            matched = {
              id: existing._id,
              name: `${existing.firstName} ${existing.lastName}`.trim(),
              admNo: existing.admNo,
              className: cls.name,
            };
            reasons.push(
              hits.length > 1
                ? `Name matches ${hits.length} existing students in ${cls.name} — verify which one`
                : `Name matches an existing student in ${cls.name}`
            );
          }
        }
      }

      students.push({
        index: i,
        status: !matched ? "new" : admNo ? "duplicate" : "conflicting",
        reasons,
        ...(matched ? { matched } : {}),
      });
    }

    // ── Staff: staffNo is authoritative; name is the fallback. ─────────
    const teachers = await ctx.db
      .query("teachers")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);
    const teacherByStaffNo = new Map<string, Doc<"teachers">>();
    for (const t of teachers) teacherByStaffNo.set(t.staffNo.trim().toLowerCase(), t);

    const staff: {
      index: number;
      status: "new" | "duplicate" | "conflicting";
      reasons: string[];
      matched?: { id: string; name: string; staffNo: string };
    }[] = [];

    for (let i = 0; i < staffRows.length; i++) {
      const row = staffRows[i];
      const reasons: string[] = [];
      let matched: { id: string; name: string; staffNo: string } | undefined;

      const staffNo = row.staffNo.trim();
      if (staffNo) {
        const existing = teacherByStaffNo.get(staffNo.toLowerCase());
        if (existing) {
          matched = {
            id: existing._id,
            name: `${existing.firstName} ${existing.lastName}`.trim(),
            staffNo: existing.staffNo,
          };
          reasons.push("Staff number already exists");
        }
      }

      if (!matched && row.firstName.trim() && row.lastName.trim()) {
        const nk = nameKey(row.firstName, row.lastName);
        const hits = teachers.filter((t) => t.schoolId === schoolId && nameKey(t.firstName, t.lastName) === nk);
        if (hits.length > 0) {
          const existing = hits[0];
          matched = {
            id: existing._id,
            name: `${existing.firstName} ${existing.lastName}`.trim(),
            staffNo: existing.staffNo,
          };
          reasons.push(
            hits.length > 1
              ? `Name matches ${hits.length} existing staff members — verify which one`
              : "Name matches an existing staff member"
          );
        }
      }

      staff.push({
        index: i,
        status: !matched ? "new" : staffNo ? "duplicate" : "conflicting",
        reasons,
        ...(matched ? { matched } : {}),
      });
    }

    return { students, staff };
  },
});

export const importBatch = action({
  args: {
    schoolId: v.id("schools"),
    files: v.array(
      v.object({
        fileName: v.string(),
        kind: v.string(),
        // Students file: student rows live in `rows`; the same file may also
        // carry staff rows (staffRows) or fee rows (feeRows) after preview
        // reconciliation. Every array is optional — only present entries run.
        rows: v.optional(v.array(importRow)),
        staffRows: v.optional(v.array(staffRow)),
        feeRows: v.optional(v.array(feeRow)),
        eavFields: v.optional(v.array(eavFieldDef)),
        staffEavFields: v.optional(v.array(eavFieldDef)),
        studentResolutions: v.optional(v.array(resolution)),
        staffResolutions: v.optional(v.array(resolution)),
      })
    ),
    createMissingClasses: v.boolean(),
    termName: v.optional(v.string()),
    termYear: v.optional(v.number()),
  },
  handler: async (ctx, { schoolId, files, createMissingClasses, termName, termYear }) => {
    type BatchRowResult = {
      row: number;
      status: "created" | "skipped" | "overwritten" | "error";
      reason?: string;
    };
    type FileResult = {
      students?: {
        created: number;
        skippedDuplicates: number;
        overwritten: number;
        guardiansCreated: number;
        guardianLinksCreated: number;
        errors: { row: number; reason: string }[];
        createdClasses: string[];
        createdStreams: string[];
        rowResults: BatchRowResult[];
      };
      staff?: {
        created: number;
        skipped: number;
        overwritten: number;
        teaching: number;
        nonTeaching: number;
        errors: { row: number; reason: string }[];
        rowResults: BatchRowResult[];
      };
      fees?: {
        structuresCreated: number;
        errors: { row: number; reason: string }[];
        createdTerm: boolean;
        termName?: string;
        termYear?: number;
        resolutions: {
          row: number;
          className: string;
          streamName?: string;
          matchedClass: string;
          matchedStream?: string;
        }[];
      };
    };
    const results: {
      fileName: string;
      kind: string;
      ok: boolean;
      result?: FileResult;
      error?: string;
    }[] = [];

    for (const file of files) {
      let ok = true;
      let fileError: string | undefined;
      const summary = {
        studentsCreated: 0,
        studentsSkipped: 0,
        studentsOverwritten: 0,
        staffCreated: 0,
        staffSkipped: 0,
        staffOverwritten: 0,
        structuresCreated: 0,
        errors: 0,
      };
      const rowResults: {
        row: number;
        kind: "student" | "staff" | "fee";
        status: "created" | "skipped" | "overwritten" | "error";
        reason?: string;
      }[] = [];
      const result: FileResult = {};

      // ── Students ─────────────────────────────────────────────────────
      if (file.rows && file.rows.length > 0) {
        const agg = {
          created: 0,
          skippedDuplicates: 0,
          overwritten: 0,
          guardiansCreated: 0,
          guardianLinksCreated: 0,
          errors: [] as { row: number; reason: string }[],
          createdClasses: [] as string[],
          createdStreams: [] as string[],
          rowResults: [] as BatchRowResult[],
        };
        for (let o = 0; o < file.rows.length; o += IMPORT_CHUNK) {
          const chunk = file.rows.slice(o, o + IMPORT_CHUNK);
          // Re-index per-row resolutions from the file's row space into this
          // chunk's local row space (indexes are positions within `rows`).
          const chunkResolutions = (file.studentResolutions ?? [])
            .filter((r) => r.index >= o && r.index < o + chunk.length)
            .map((r) => ({ index: r.index - o, action: r.action }));
          try {
            const res = await ctx.runMutation(internal.imports.importStudentsInternal, {
              schoolId,
              rows: chunk,
              createMissingClasses,
              resolutions: chunkResolutions.length > 0 ? chunkResolutions : undefined,
              eavFields: file.eavFields,
            });
            agg.created += res.created;
            agg.skippedDuplicates += res.skippedDuplicates;
            agg.overwritten += res.overwritten;
            agg.guardiansCreated += res.guardiansCreated;
            agg.guardianLinksCreated += res.guardianLinksCreated;
            agg.createdClasses.push(...res.createdClasses);
            agg.createdStreams.push(...res.createdStreams);
            for (const e of res.errors) agg.errors.push({ row: e.row + o, reason: e.reason });
            for (const rr of res.rowResults) {
              agg.rowResults.push({ row: rr.row + o, status: rr.status, reason: rr.reason });
              rowResults.push({ row: rr.row + o, kind: "student", status: rr.status, reason: rr.reason });
            }
          } catch (err: any) {
            ok = false;
            fileError = err?.message ?? String(err);
            break;
          }
        }
        summary.studentsCreated += agg.created;
        summary.studentsSkipped += agg.skippedDuplicates;
        summary.studentsOverwritten += agg.overwritten;
        summary.errors += agg.errors.length;
        result.students = agg;
      }

      // ── Staff ────────────────────────────────────────────────────────
      if (ok && file.staffRows && file.staffRows.length > 0) {
        const agg = {
          created: 0,
          skipped: 0,
          overwritten: 0,
          teaching: 0,
          nonTeaching: 0,
          errors: [] as { row: number; reason: string }[],
          rowResults: [] as BatchRowResult[],
        };
        for (let o = 0; o < file.staffRows.length; o += IMPORT_CHUNK) {
          const chunk = file.staffRows.slice(o, o + IMPORT_CHUNK);
          const chunkResolutions = (file.staffResolutions ?? [])
            .filter((r) => r.index >= o && r.index < o + chunk.length)
            .map((r) => ({ index: r.index - o, action: r.action }));
          try {
            const res = await ctx.runMutation(internal.imports.importStaffInternal, {
              schoolId,
              rows: chunk,
              resolutions: chunkResolutions.length > 0 ? chunkResolutions : undefined,
              eavFields: file.staffEavFields,
            });
            agg.created += res.created;
            agg.skipped += res.skipped;
            agg.overwritten += res.overwritten;
            agg.teaching += res.teaching;
            agg.nonTeaching += res.nonTeaching;
            for (const e of res.errors) agg.errors.push({ row: e.row + o, reason: e.reason });
            for (const rr of res.rowResults) {
              agg.rowResults.push({ row: rr.row + o, status: rr.status, reason: rr.reason });
              rowResults.push({ row: rr.row + o, kind: "staff", status: rr.status, reason: rr.reason });
            }
          } catch (err: any) {
            ok = false;
            fileError = err?.message ?? String(err);
            break;
          }
        }
        summary.staffCreated += agg.created;
        summary.staffSkipped += agg.skipped;
        summary.staffOverwritten += agg.overwritten;
        summary.errors += agg.errors.length;
        result.staff = agg;
      }

      // ── Fees ─────────────────────────────────────────────────────────
      if (ok && file.feeRows && file.feeRows.length > 0) {
        const agg = {
          structuresCreated: 0,
          errors: [] as { row: number; reason: string }[],
          createdTerm: false,
          termName: undefined as string | undefined,
          termYear: undefined as number | undefined,
          resolutions: [] as {
            row: number;
            className: string;
            streamName?: string;
            matchedClass: string;
            matchedStream?: string;
          }[],
        };
        // Effective term: prefer the file's own Term/Year columns; fall back
        // to the action-level current term.
        const rowTerm = file.feeRows.find((r) => r.termName && r.termYear !== undefined);
        const effTermName = rowTerm?.termName ?? termName;
        const effTermYear = rowTerm?.termYear ?? termYear;
        for (let o = 0; o < file.feeRows.length; o += IMPORT_CHUNK) {
          const chunk = file.feeRows.slice(o, o + IMPORT_CHUNK);
          try {
            const res = await ctx.runMutation(internal.imports.importFeesInternal, {
              schoolId,
              rows: chunk,
              createMissingClasses,
              termName: effTermName,
              termYear: effTermYear,
            });
            agg.structuresCreated += res.structuresCreated;
            agg.createdTerm = agg.createdTerm || res.createdTerm;
            if (res.termName) agg.termName = res.termName;
            if (res.termYear !== undefined) agg.termYear = res.termYear;
            for (const e of res.errors) {
              agg.errors.push({ row: e.row + o, reason: e.reason });
              rowResults.push({ row: e.row + o, kind: "fee", status: "error", reason: e.reason });
            }
            for (const r of res.resolutions) {
              agg.resolutions.push({ ...r, row: r.row + o });
              rowResults.push({ row: r.row + o, kind: "fee", status: "created" });
            }
          } catch (err: any) {
            ok = false;
            fileError = err?.message ?? String(err);
            break;
          }
        }
        summary.structuresCreated += agg.structuresCreated;
        summary.errors += agg.errors.length;
        result.fees = agg;
      }

      // ── Persist the run to Files/Import-Runs history ────────────────
      if (ok) {
        try {
          await ctx.runMutation(internal.imports.recordImportRunInternal, {
            schoolId,
            fileName: file.fileName,
            kind: file.kind,
            ok,
            summary,
            rowResults,
          });
        } catch (err: any) {
          // Never fail an import because history recording itself failed.
          console.error("Failed to record import run:", err);
        }
      }

      results.push({ fileName: file.fileName, kind: file.kind, ok, result, error: fileError });
    }
    return { files: results };
  },
});

export const importAttendance = action({
  args: {
    schoolId: v.id("schools"),
    date: v.float64(),
    periodNumber: v.optional(v.number()),
    records: v.array(v.object({ admNo: v.string(), status: v.union(v.literal("present"), v.literal("absent"), v.literal("late"), v.literal("excused")) })),
  },
  handler: async (ctx, { schoolId, date, periodNumber, records }) => {
    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        const student = await ctx.runQuery(internal.imports.getStudentByAdmNo, { schoolId, admNo: r.admNo });
        if (!student) { errors.push({ row: i + 1, reason: `Student ${r.admNo} not found` }); continue; }
        const dayStart = new Date(date); dayStart.setHours(0,0,0,0);
        await ctx.runMutation(internal.imports.upsertAttendance, {
          schoolId, classId: student.classId, studentId: student._id, date: dayStart.getTime(), status: r.status, markedBy: "import",
        });
        created++;
      } catch (err: any) {
        errors.push({ row: i + 1, reason: err.message ?? String(err) });
      }
    }
    return { created, errors };
  },
});

export const importFeePayments = action({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({
      admNo: v.string(), amount: v.number(), method: v.string(),
      date: v.optional(v.number()), reference: v.optional(v.string()),
      termName: v.optional(v.string()), termYear: v.optional(v.number()),
    })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let o = 0; o < rows.length; o += IMPORT_CHUNK) {
      const chunk = rows.slice(o, o + IMPORT_CHUNK);
      try {
        const res = await ctx.runMutation(internal.imports.importFeePaymentsInternal, {
          schoolId,
          rows: chunk,
        });
        created += res.created;
        for (const e of res.errors) errors.push({ row: e.row + o, reason: e.reason });
      } catch (err: any) {
        errors.push({ row: o + 1, reason: err?.message ?? String(err) });
      }
    }
    return { created, skipped: 0, errors };
  },
});

export const importSubjects = action({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({ name: v.string(), code: v.string(), level: v.string() })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let o = 0; o < rows.length; o += IMPORT_CHUNK) {
      const chunk = rows.slice(o, o + IMPORT_CHUNK);
      try {
        const res = await ctx.runMutation(internal.imports.importSubjectsInternal, {
          schoolId,
          rows: chunk,
        });
        created += res.created;
        for (const e of res.errors) errors.push({ row: e.row + o, reason: e.reason });
      } catch (err: any) {
        errors.push({ row: o + 1, reason: err?.message ?? String(err) });
      }
    }
    return { created, skipped: 0, errors };
  },
});

export const importClasses = action({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({ className: v.string(), streamName: v.optional(v.string()) })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    let classesCreated = 0;
    let streamsCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let o = 0; o < rows.length; o += IMPORT_CHUNK) {
      const chunk = rows.slice(o, o + IMPORT_CHUNK);
      try {
        const res = await ctx.runMutation(internal.imports.importClassesInternal, {
          schoolId,
          rows: chunk,
        });
        classesCreated += res.classesCreated;
        streamsCreated += res.streamsCreated;
        for (const e of res.errors) errors.push({ row: e.row + o, reason: e.reason });
      } catch (err: any) {
        errors.push({ row: o + 1, reason: err?.message ?? String(err) });
      }
    }
    return { classesCreated, streamsCreated, skipped: 0, errors };
  },
});

export const importTerms = action({
  args: {
    schoolId: v.id("schools"),
    rows: v.array(v.object({
      name: v.string(), year: v.number(),
      startDate: v.number(), endDate: v.number(),
    })),
  },
  handler: async (ctx, { schoolId, rows }) => {
    let termsCreated = 0;
    let academicYearsCreated = 0;
    const errors: { row: number; reason: string }[] = [];
    for (let o = 0; o < rows.length; o += IMPORT_CHUNK) {
      const chunk = rows.slice(o, o + IMPORT_CHUNK);
      try {
        const res = await ctx.runMutation(internal.imports.importTermsInternal, {
          schoolId,
          rows: chunk,
        });
        termsCreated += res.termsCreated;
        academicYearsCreated += res.academicYearsCreated;
        for (const e of res.errors) errors.push({ row: e.row + o, reason: e.reason });
      } catch (err: any) {
        errors.push({ row: o + 1, reason: err?.message ?? String(err) });
      }
    }
    return { termsCreated, academicYearsCreated, skipped: 0, errors };
  },
});

