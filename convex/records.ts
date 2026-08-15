import { query, mutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";
import { Id, Doc } from "./_generated/dataModel";

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
    return await ctx.db
      .query("records")
      .withIndex("by_schoolId_bucket", (q) =>
        q.eq("schoolId", args.schoolId).eq("bucket", args.bucket)
      )
      .order("asc")
      .take(500);
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
    const q = ctx.db
      .query("records")
      .withSearchIndex("search_displayName", (q) =>
        q.search("displayName", args.query).eq("schoolId", args.schoolId)
      );
    if (args.bucket) {
      // searchIndex doesn't support filtering on bucket, so filter after
      const results = await q.take(20);
      return results.filter((r) => r.bucket === args.bucket);
    }
    return await q.take(20);
  },
});

export const get = query({
  args: { id: v.id("records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireSchoolMembership(ctx, record.schoolId);
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
    // Direct link to a student (learner bucket) so the EAV Modules tab can
    // resolve a student's record without a name-based search.
    studentId: v.optional(v.id("students")),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("records", {
      schoolId: args.schoolId,
      bucket: args.bucket,
      displayName: args.displayName,
      photoUrl: args.photoUrl,
      status: args.status,
      studentId: args.studentId,
    });
    await logAuditEntry(ctx, args.schoolId, "record.create", {
      recordId: id,
      bucket: args.bucket,
      displayName: args.displayName,
    });
    return id;
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

    // Remove all field values for this record
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.id))
      .take(500);
    for (const fv of values) {
      await ctx.db.delete(fv._id);
    }

    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, record.schoolId, "record.remove", {
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
        const sections = await ctx.db
          .query("sections")
          .withIndex("by_moduleId", (q) => q.eq("moduleId", mod._id))
          .order("asc")
          .take(100);

        const enabledSections = sections.filter((s) => s.isEnabled);

        const sectionsWithData = await Promise.all(
          enabledSections.map(async (sec) => {
            const fields = await ctx.db
              .query("fields")
              .withIndex("by_sectionId", (q) => q.eq("sectionId", sec._id))
              .order("asc")
              .take(100);

            const enabledFields = fields.filter((f) => f.isEnabled !== false);

            return {
              sectionId: sec._id,
              name: sec.name,
              description: sec.description,
              order: sec.order,
              isRepeatable: sec.isRepeatable === true,
              isSensitive: sec.isSensitive === true,
              fields: enabledFields.map((f) => {
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
              }),
            };
          })
        );

        return {
          moduleId: mod._id,
          name: mod.name,
          description: mod.description,
          order: mod.order,
          icon: mod.icon,
          sections: sectionsWithData,
        };
      })
    );

    return {
      recordId: record?._id ?? null,
      modules: modulesWithData,
    };
  },
});
