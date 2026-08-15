import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc } from "./_generated/dataModel";
import {
  requireSchoolMembership,
  requireClassMembership,
  requireStudentMembership,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";
import { checkRateLimit } from "./rateLimit";
import { nextAdmissionNumberInternal } from "./blueprints";

// ── Shared field validators ─────────────────────────────────────────
// Student 360 fields (Phase 1). All optional so the schema stays
// backward-compatible and imports can be partial.
// Phase 18: only the typed semantic core remains on the students doc.
// Gender, DOB, admission date, guardian & contact details are school-defined
// EAV fields (created manually or from an upload with AI consent).

export const studentFields = v.object({
  firstName: v.string(),
  lastName: v.string(),
  // Optional: when blank, the school's blueprint convention generates it.
  admNo: v.optional(v.string()),
  status: v.optional(
    v.union(
      v.literal("active"),
      v.literal("graduated"),
      v.literal("withdrawn"),
      v.literal("suspended")
    )
  ),
  photoUrl: v.optional(v.string()),
});

const placementFields = v.object({
  classId: v.id("classes"),
  streamId: v.optional(v.id("streams")),
});

const createArgs = v
  .object({ schoolId: v.id("schools") })
  .extend(placementFields.fields)
  .extend(studentFields.fields);

const updateArgs = v
  .object({ id: v.id("students") })
  .extend(placementFields.partial().fields)
  .extend(studentFields.partial().fields);

// ── Read-only queries ───────────────────────────────────────────────

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);
  },
});

/**
 * Paginated version of listBySchool for large datasets.
 * Returns students in pages with cursor-based pagination.
 */
export const listBySchoolPaginated = query({
  args: {
    schoolId: v.id("schools"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { schoolId, paginationOpts }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .paginate(paginationOpts);
  },
});

export const listByClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    const cls = await requireClassMembership(ctx, classId);
    return await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(500);
  },
});

export const getByAdmNo = query({
  args: { schoolId: v.id("schools"), admNo: v.string() },
  handler: async (ctx, { schoolId, admNo }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("students")
      .withIndex("by_admNo", (q) => q.eq("schoolId", schoolId).eq("admNo", admNo))
      .first();
  },
});

export const get = query({
  args: { id: v.id("students") },
  handler: async (ctx, { id }) => {
    await requireStudentMembership(ctx, id);
    return await ctx.db.get(id);
  },
});

/**
 * Global student search (Student 360).
 *
 * Searches:
 *  - firstName / lastName via full-text search indexes
 *  - admNo via full-text index AND exact match
 *
 * Results are deduped, tenant-scoped (schoolId filterField), and capped.
 * Phase 18: guardian phone was searched via a stripped column — guardian
 * contact now lives in the guardian ENTITY system, searched separately.
 */
export const search = query({
  args: { schoolId: v.id("schools"), query: v.string() },
  handler: async (ctx, { schoolId, query }) => {
    const q = query.trim();
    if (!q) return [];
    await requireSchoolMembership(ctx, schoolId);

    const [byFirst, byLast, byAdmIdx] = await Promise.all([
      ctx.db
        .query("students")
        .withSearchIndex("search_firstName", (s) => s.search("firstName", q).eq("schoolId", schoolId))
        .take(10),
      ctx.db
        .query("students")
        .withSearchIndex("search_lastName", (s) => s.search("lastName", q).eq("schoolId", schoolId))
        .take(10),
      ctx.db
        .query("students")
        .withSearchIndex("search_admNo", (s) => s.search("admNo", q).eq("schoolId", schoolId))
        .take(10),
    ]);

    const exactAdm = await ctx.db
      .query("students")
      .withIndex("by_admNo", (r) => r.eq("schoolId", schoolId).eq("admNo", q))
      .first();

    // Dedupe by id. The exact admNo hit is inserted first so it sorts
    // first (Map.set on an existing key keeps the original position).
    const map = new Map<string, Doc<"students">>();
    if (exactAdm) map.set(exactAdm._id, exactAdm);
    for (const s of [...byFirst, ...byLast, ...byAdmIdx]) {
      if (s) map.set(s._id, s);
    }

    return [...map.values()].slice(0, 20);
  },
});

// ── Mutations ───────────────────────────────────────────────────────

export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    await requireClassMembership(ctx, args.classId);
    // Rate limit: max 20 student creations per school per minute
    await checkRateLimit(ctx, `student-create:${args.schoolId}`, 20, 60_000);

    if (args.streamId) {
      const stream = await ctx.db.get(args.streamId);
      if (!stream || stream.classId !== args.classId) {
        throw new Error("Stream does not belong to the selected class");
      }
    }

    // Auto-generate the admission number when the caller left it blank,
    // using the school's blueprint convention (falls back to legacy scheme).
    const admNo = args.admNo?.trim() || (await nextAdmissionNumberInternal(ctx, args.schoolId));

    const existing = await ctx.db
      .query("students")
      .withIndex("by_admNo", (q) => q.eq("schoolId", args.schoolId).eq("admNo", admNo))
      .first();
    if (existing) {
      throw new Error("A student with this admission number already exists in this school");
    }

    // Convex strips undefined optional fields automatically on insert.
    const studentId = await ctx.db.insert("students", { ...args, admNo });
    await logAuditEntry(ctx, args.schoolId, "student.create", {
      studentId,
      firstName: args.firstName,
      lastName: args.lastName,
      admNo: args.admNo,
    });
    return studentId;
  },
});

export const update = mutation({
  args: updateArgs,
  handler: async (ctx, { id, ...updates }) => {
    const student = await requireStudentMembership(ctx, id);
    if (updates.classId) {
      await requireClassMembership(ctx, updates.classId);
    }
    if (updates.streamId) {
      const stream = await ctx.db.get(updates.streamId);
      const targetClassId = updates.classId ?? student.classId;
      if (!stream || stream.classId !== targetClassId) {
        throw new Error("Stream does not belong to the selected class");
      }
    }
    if (updates.admNo !== undefined) {
      const existing = await ctx.db
        .query("students")
        .withIndex("by_admNo", (q) => q.eq("schoolId", student.schoolId).eq("admNo", updates.admNo!))
        .first();
      if (existing && existing._id !== id) {
        throw new Error("A student with this admission number already exists in this school");
      }
    }
    await patchDefinedFields(ctx, "students", id, updates);
    await logAuditEntry(ctx, student.schoolId, "student.update", { studentId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("students") },
  handler: async (ctx, { id }) => {
    const student = await requireStudentMembership(ctx, id);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, student.schoolId, "student.remove", {
      studentId: id,
      admNo: student.admNo,
      firstName: student.firstName,
      lastName: student.lastName,
    });
  },
});
