import { query, mutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";
import { Id, Doc } from "./_generated/dataModel";
import { accessFor } from "./accessResolver";

export const listBySchoolAndBucket = query({
  args: {
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
    ),
    paginationOpts: v.optional(
      v.object({
        numItems: v.number(),
        cursor: v.union(v.string(), v.null()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    // P0#3 §7: fail-closed bucket scope — a role with no scope rule for this
    // bucket sees nothing here (leadership/all bypass).
    const access = await accessFor(ctx, args.schoolId);
    access.requireBucketScope(args.bucket);
    const records = await ctx.db
      .query("records")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", args.schoolId).eq("bucket", args.bucket)
      )
      .order("asc")
      .take(500);
    return records.filter((r) => !r.deletedAt);
  },
});

export const searchByName = query({
  args: {
    schoolId: v.id("schools"),
    query: v.string(),
    bucket: v.optional(
      v.union(
        v.literal("learner"),
        v.literal("teaching_staff"),
        v.literal("non_teaching_staff"),
        v.literal("admin_staff"),
        v.literal("leadership"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    // P0#3 §7: search is scoped to the buckets the caller can view. An explicit
    // bucket arg is required to be visible; otherwise results are filtered to
    // the caller's accessible buckets (fail-closed when none are accessible).
    const access = await accessFor(ctx, args.schoolId);
    const visibleBuckets = new Set(
      ["learner", "teaching_staff", "non_teaching_staff", "admin_staff", "leadership"].filter((b) =>
        access.canViewBucket(b)
      )
    );
    if (visibleBuckets.size === 0) return [];
    const q = ctx.db
      .query("records")
      .withSearchIndex("search_displayName", (q) =>
        q.search("displayName", args.query).eq("schoolId", args.schoolId)
      );
    const results = await q.take(20);
    return results.filter(
      (r) =>
        !r.deletedAt &&
        visibleBuckets.has(r.bucket) &&
        (!args.bucket || r.bucket === args.bucket)
    );
  },
});

export const get = query({
  args: { id: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const access = await accessFor(ctx, record.schoolId);
    access.requireBucketScope(record.bucket);
    return record;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
    ),
    displayName: v.string(),
    photoUrl: v.optional(v.string()),
    status: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    teacherId: v.optional(v.id("teachers")),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const access = await accessFor(ctx, args.schoolId);
    access.requireBucketScope(args.bucket);
    const id = await ctx.db.insert("records", {
      schoolId: args.schoolId,
      bucket: args.bucket,
      displayName: args.displayName,
      photoUrl: args.photoUrl,
      status: args.status,
      studentId: args.studentId,
      teacherId: args.teacherId,
    });
    await logAuditEntry(ctx, args.schoolId, "record.create", {
      recordId: id,
      bucket: args.bucket,
      displayName: args.displayName,
    });
    return id;
  },
});

export const bulkCreate = mutation({
  args: {
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
    ),
    records: v.array(
      v.object({
        displayName: v.string(),
        photoUrl: v.optional(v.string()),
        status: v.optional(v.string()),
        studentId: v.optional(v.id("students")),
        teacherId: v.optional(v.id("teachers")),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const access = await accessFor(ctx, args.schoolId);
    access.requireBucketScope(args.bucket);

    let created = 0;
    let skipped = 0;

    for (const rec of args.records) {
      const doc: {
        schoolId: Id<"schools">;
        bucket: "learner" | "teaching_staff" | "non_teaching_staff" | "admin_staff" | "leadership";
        displayName: string;
        photoUrl?: string;
        status?: string;
        studentId?: Id<"students">;
        teacherId?: Id<"teachers">;
        deletedAt?: number;
      } = {
        schoolId: args.schoolId,
        bucket: args.bucket,
        displayName: rec.displayName,
      };
      if (rec.photoUrl !== undefined) doc.photoUrl = rec.photoUrl;
      if (rec.status !== undefined) doc.status = rec.status;
      if (rec.studentId !== undefined) doc.studentId = rec.studentId;
      if (rec.teacherId !== undefined) doc.teacherId = rec.teacherId;

      await ctx.db.insert("records", doc);
      created++;
    }

    await logAuditEntry(ctx, args.schoolId, "record.bulkCreate", {
      bucket: args.bucket,
      count: created,
      skipped,
    });
    return { created, skipped };
  },
});

export const update = mutation({
  args: {
    id: v.id("records"),
    displayName: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const access = await accessFor(ctx, record.schoolId);
    access.requireBucketScope(record.bucket);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.displayName !== undefined) updates.displayName = fields.displayName;
    if (fields.photoUrl !== undefined) updates.photoUrl = fields.photoUrl;
    if (fields.status !== undefined) updates.status = fields.status;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, record.schoolId, "record.update", {
      recordId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const access = await accessFor(ctx, record.schoolId);
    access.requireBucketScope(record.bucket);

    // Soft-delete: archive instead of permanent delete. The record disappears
    // from lists/search but its fieldValues are retained for history.
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await logAuditEntry(ctx, record.schoolId, "record.remove", {
      recordId: args.id,
      displayName: record.displayName,
    });
  },
});

export const restore = mutation({
  args: { id: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const access = await accessFor(ctx, record.schoolId);
    access.requireBucketScope(record.bucket);
    await ctx.db.patch(args.id, { deletedAt: undefined });
    await logAuditEntry(ctx, record.schoolId, "record.restore", {
      recordId: args.id,
      displayName: record.displayName,
    });
  },
});

export const hardDelete = mutation({
  args: { id: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
    const access = await accessFor(ctx, record.schoolId);
    access.requireBucketScope(record.bucket);

    // Permanent delete: remove all field values, then the record itself.
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.id))
      .take(500);
    for (const fv of values) {
      await ctx.db.delete(fv._id);
    }

    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, record.schoolId, "record.hardDelete", {
      recordId: args.id,
      displayName: record.displayName,
    });
  },
});

// ── Student 360° EAV Integration ───────────────────────────────────

/** Find the EAV record linked to a specific student. */
export const getByStudentId = query({
  args: {
    studentId: v.id("students"),
  },
  handler: async (ctx, { studentId }) => {
    const student = await ctx.db.get(studentId);
    if (!student) return null;
    await requireSchoolMembership(ctx, student.schoolId);
    return await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();
  },
});

/**
 * Student 360° — returns all EAV modules for a student with their field values.
 * If no EAV record exists for the student yet, creates one automatically.
 * Used by the StudentProfileView to render the EAV modules tab.
 */
// ── Student 360° prefill derivation ────────────────────────────────
// Phase 18: the students doc carries only the typed semantic core (name,
// admNo, class, stream, status). The EAV modules DON'T hard-code these — the
// school defines its own fields, tagged with a semantic meaning or aliases
// (gender, dateOfBirth, guardianName, …). getStudentEavModules is the one
// surface that reads a student's EAV rows; it now ALSO pre-fills every field
// whose value the engine already knows (the student doc, class/stream names,
// the guardian entity), so a freshly-imported student no longer shows blank
// inputs. Stored EAV values always win over derived ones.

/** Humanized label for a student status value (active → "Active"). */
function humanizeStatus(status?: string): string {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Resolve the primary guardian record for a student (guardian_links → guardians).
 * Returns `null` when the student has no linked guardian.
 */
async function loadPrimaryGuardian(
  ctx: Pick<QueryCtx, "db">,
  studentId: Id<"students">
): Promise<{
  name: string;
  relationship: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
} | null> {
  const links = await ctx.db
    .query("guardian_links")
    .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
    .take(20);
  const primary = links.find((l) => l.isPrimary) ?? links[0];
  if (!primary) return null;
  const g = await ctx.db.get(primary.guardianId);
  if (!g) return null;
  return {
    name: `${g.firstName} ${g.lastName}`.trim(),
    relationship: g.relationship,
    phone: g.phone,
    phone2: g.phone2 ?? undefined,
    email: g.email ?? undefined,
    address: g.address ?? undefined,
  };
}

/**
 * Derive the engine-known value for a field from the student's core data,
 * the class/stream names, and the guardian entity. Matches by semantic tag
 * first, then by alias (case-insensitive). Returns "" when unknown.
 */
function deriveFieldPrefill(
  field: Doc<"fields">,
  sources: {
    fullName: string;
    admNo: string;
    className: string;
    streamName: string;
    status: string;
    guardian: {
      name: string;
      relationship: string;
      phone: string;
      phone2?: string;
      email?: string;
      address?: string;
    } | null;
  }
): string {
  const { fullName, admNo, className, streamName, status, guardian } = sources;
  // Semantic tags map a field to its engine meaning regardless of the label.
  if (field.semantic === "name") return fullName;
  if (field.semantic === "admNo") return admNo;
  if (field.semantic === "class") return className;
  if (field.semantic === "status") return humanizeStatus(status);

  const lowerAliases = new Set((field.aliases ?? []).map((a) => a.toLowerCase().trim()));
  const hasAlias = (...keys: string[]) => keys.some((k) => lowerAliases.has(k));

  // Streams resolve by alias (no dedicated semantic tag).
  if (hasAlias("stream", "streamname", "streamid")) return streamName;
  // Guardian entity fields resolve by the canonical guardian aliases.
  if (guardian) {
    if (hasAlias("guardianname", "parentname", "parent")) return guardian.name;
    if (hasAlias("guardianrelation", "relationship", "relation")) return guardian.relationship;
    if (hasAlias("guardianphone", "parentphone", "phone")) return guardian.phone;
    if (hasAlias("guardianphone2", "phone2")) return guardian.phone2 ?? "";
    if (hasAlias("guardianemail", "parentemail", "email")) return guardian.email ?? "";
    if (hasAlias("homeaddress", "address")) return guardian.address ?? "";
  }
  return "";
}

export const getStudentEavModules = query({
  args: {
    studentId: v.id("students"),
  },
  handler: async (ctx, { studentId }) => {
    const student = await ctx.db.get(studentId);
    if (!student) return null;
    await requireSchoolMembership(ctx, student.schoolId);
    // P0#3 §7: the modules a caller sees are the modules they have
    // permission to view. Fields/sections cascade down the same tree.
    const access = await accessFor(ctx, student.schoolId);

    // Find the EAV record (may not exist yet — modules still render so the
    // school sees its structure and pre-filled values; saving creates it).
    const record = await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();

    // Sources for prefill — the student doc + names + guardian entity. Loaded
    // up front so a single pass over every field can reference them.
    const [cls, stream, guardian] = await Promise.all([
      ctx.db.get(student.classId),
      student.streamId ? ctx.db.get(student.streamId) : Promise.resolve(null),
      loadPrimaryGuardian(ctx, student._id),
    ]);
    const sources = {
      fullName: `${student.firstName} ${student.lastName}`.trim(),
      admNo: student.admNo,
      className: cls?.name ?? "",
      streamName: stream?.name ?? "",
      status: student.status ?? "",
      guardian,
    };

    // Pre-fetched fieldValues for this record (empty when no record yet).
    const fieldValues = record
      ? await ctx.db
          .query("fieldValues")
          .withIndex("by_recordId", (q) => q.eq("recordId", record._id))
          .take(2000)
      : [];
    const storedByFieldId = new Map(
      fieldValues.filter((fv) => !fv.instanceId).map((fv) => [fv.fieldId, fv.value])
    );

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", student.schoolId).eq("bucket", "learner")
      )
      .order("asc")
      .take(100);

    const enabledModules = modules.filter((m) => m.isEnabled);

    const modulesWithData = await Promise.all(
      enabledModules.map(async (mod) => {
        access.noteNode(mod);
        // Hide modules the caller has no permission to view (fail-closed).
        if ((await access.resolve("module", mod._id as string)) === "none") return null;

        const sections = await ctx.db
          .query("sections")
          .withIndex("by_moduleId", (q) => q.eq("moduleId", mod._id))
          .order("asc")
          .take(100);

        const enabledSections = sections.filter((s) => s.isEnabled);

        const sectionsWithData = await Promise.all(
          enabledSections.map(async (sec) => {
            access.noteNode(sec);
            if ((await access.resolve("section", sec._id as string)) === "none") return null;

            const fields = await ctx.db
              .query("fields")
              .withIndex("by_sectionId", (q) => q.eq("sectionId", sec._id))
              .order("asc")
              .take(100);

            const enabledFields = fields.filter((f) => f.isEnabled !== false && !f.deletedAt);

            const visibleFields = await Promise.all(
              enabledFields.map(async (f) => {
                access.noteNode(f);
                // Hide fields the caller can't view, but never prefill/hide
                // based on sensitivity alone — access is permission-driven.
                if ((await access.resolve("field", f._id as string)) === "none") return null;

                const stored = storedByFieldId.get(f._id);
                const derived = deriveFieldPrefill(f, sources);
                return {
                  fieldId: f._id,
                  name: f.name,
                  inputType: f.inputType,
                  isRequired: f.isRequired,
                  isSensitive: f.isSensitive === true,
                  options: f.options,
                  // Stored EAV value wins; otherwise show the engine-known
                  // value so the tab is never blank when the data exists.
                  value: stored ?? derived,
                };
              })
            );

            if (visibleFields.every((f) => f === null)) return null;

            return {
              sectionId: sec._id,
              name: sec.name,
              description: sec.description,
              order: sec.order,
              isRepeatable: sec.isRepeatable === true,
              isSensitive: sec.isSensitive === true,
              // The odd `as any` is a TS narrowing stopgap — nullable entries
              // were already excluded above.
              fields: visibleFields.filter(Boolean) as NonNullable<(typeof visibleFields)[number]>[],
            };
          })
        );

        const visibleSections = sectionsWithData.filter((s) => s !== null);
        if (visibleSections.length === 0) return null;

        return {
          moduleId: mod._id,
          name: mod.name,
          description: mod.description,
          order: mod.order,
          icon: mod.icon,
          sections: visibleSections,
        };
      })
    );

    return {
      recordId: record?._id ?? null,
      modules: modulesWithData.filter((m) => m !== null),
    };
  },
});

/**
 * Student 360° symmetric treatment for teachers (§1.4) — returns all EAV
 * modules for a teacher's linked staff record, mirroring getStudentEavModules.
 * If no EAV record exists for the teacher yet, creates one automatically.
 */
export const getTeacherEavModules = query({
  args: {
    teacherId: v.id("teachers"),
  },
  handler: async (ctx, { teacherId }) => {
    const teacher = await ctx.db.get(teacherId);
    if (!teacher) return null;
    await requireSchoolMembership(ctx, teacher.schoolId);
    // P0#3 §7: same fail-closed permission cascade as the learner surface.
    const access = await accessFor(ctx, teacher.schoolId);

    // Find the staff EAV record (may not exist yet — modules still render).
    const record = await ctx.db
      .query("records")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .first();

    const fieldValues = record
      ? await ctx.db
          .query("fieldValues")
          .withIndex("by_recordId", (q) => q.eq("recordId", record._id))
          .take(2000)
      : [];
    const storedByFieldId = new Map(
      fieldValues.filter((fv) => !fv.instanceId).map((fv) => [fv.fieldId, fv.value])
    );

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", teacher.schoolId).eq("bucket", "teaching_staff")
      )
      .order("asc")
      .take(100);

    const enabledModules = modules.filter((m) => m.isEnabled);

    const modulesWithData = await Promise.all(
      enabledModules.map(async (mod) => {
        access.noteNode(mod);
        if ((await access.resolve("module", mod._id as string)) === "none") return null;

        const sections = await ctx.db
          .query("sections")
          .withIndex("by_moduleId", (q) => q.eq("moduleId", mod._id))
          .order("asc")
          .take(100);

        const enabledSections = sections.filter((s) => s.isEnabled);

        const sectionsWithData = await Promise.all(
          enabledSections.map(async (sec) => {
            access.noteNode(sec);
            if ((await access.resolve("section", sec._id as string)) === "none") return null;

            const fields = await ctx.db
              .query("fields")
              .withIndex("by_sectionId", (q) => q.eq("sectionId", sec._id))
              .order("asc")
              .take(100);

            const enabledFields = fields.filter((f) => f.isEnabled !== false && !f.deletedAt);

            const visibleFields = await Promise.all(
              enabledFields.map(async (f) => {
                access.noteNode(f);
                if ((await access.resolve("field", f._id as string)) === "none") return null;

                const stored = storedByFieldId.get(f._id);
                const derived = deriveStaffFieldPrefill(f, teacher);
                return {
                  fieldId: f._id,
                  name: f.name,
                  inputType: f.inputType,
                  isRequired: f.isRequired,
                  isSensitive: f.isSensitive === true,
                  options: f.options,
                  value: stored ?? derived,
                };
              })
            );

            if (visibleFields.every((f) => f === null)) return null;

            return {
              sectionId: sec._id,
              name: sec.name,
              description: sec.description,
              order: sec.order,
              isRepeatable: sec.isRepeatable === true,
              isSensitive: sec.isSensitive === true,
              fields: visibleFields.filter(Boolean) as NonNullable<(typeof visibleFields)[number]>[],
            };
          })
        );

        const visibleSections = sectionsWithData.filter((s) => s !== null);
        if (visibleSections.length === 0) return null;

        return {
          moduleId: mod._id,
          name: mod.name,
          description: mod.description,
          order: mod.order,
          icon: mod.icon,
          sections: visibleSections,
        };
      })
    );

    return {
      recordId: record?._id ?? null,
      modules: modulesWithData.filter((m) => m !== null),
    };
  },
});

/**
 * Derive the engine-known value for a staff field from the teacher's typed
 * core (name, staffNo, department, category, email, phone). Mirrors
 * deriveFieldPrefill on the learner side.
 */
function deriveStaffFieldPrefill(field: Doc<"fields">, teacher: Doc<"teachers">): string {
  if (field.semantic === "name") return `${teacher.firstName} ${teacher.lastName}`.trim();
  const lowerAliases = new Set((field.aliases ?? []).map((a) => a.toLowerCase().trim()));
  const hasAlias = (...keys: string[]) => keys.some((k) => lowerAliases.has(k));
  if (hasAlias("staffno", "staffid", "staffnumber", "employeeid")) return teacher.staffNo;
  if (hasAlias("email", "workemail")) return teacher.email ?? "";
  if (hasAlias("phone", "mobile", "tel")) return teacher.phone ?? "";
  if (hasAlias("department", "dept")) return teacher.department ?? "";
  if (hasAlias("firstname", "givenname")) return teacher.firstName;
  if (hasAlias("lastname", "surname", "familyname")) return teacher.lastName;
  return "";
}
