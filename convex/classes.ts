import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requirePrincipal,
  requireClassMembership,
  requireSuperadmin,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const get = query({
  args: { id: v.id("classes") },
  handler: async (ctx, { id }) => {
    await requireClassMembership(ctx, id);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    hasStreams: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const classId = await ctx.db.insert("classes", args);
    await logAuditEntry(ctx, args.schoolId, "class.create", { classId, name: args.name });
    return classId;
  },
});

export const update = mutation({
  args: {
    id: v.id("classes"),
    name: v.optional(v.string()),
    hasStreams: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const cls = await requireClassMembership(ctx, id);
    await patchDefinedFields(ctx, "classes", id, updates);
    await logAuditEntry(ctx, cls.schoolId, "class.update", { classId: id, ...updates });
  },
});

export const remove = mutation({
  args: {
    id: v.id("classes"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, force }) => {
    const cls = await requireClassMembership(ctx, id);

    const studentsInClass = await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", id))
      .take(1);
    if (studentsInClass.length > 0) {
      if (!force) {
        throw new Error("Cannot delete class: students are still assigned to it. Reassign or remove them first, or use force delete.");
      }
      // Cascade: delete all students in this class (allowed for class owners and superadmin)
      const BATCH_SIZE = 100;
      let studentsBatch = await ctx.db
        .query("students")
        .withIndex("by_classId", (q) => q.eq("classId", id))
        .take(BATCH_SIZE);
      while (studentsBatch.length > 0) {
        for (let i = 0; i < studentsBatch.length; i++) {
          await ctx.db.delete(studentsBatch[i]._id);
        }
        studentsBatch = await ctx.db
          .query("students")
          .withIndex("by_classId", (q) => q.eq("classId", id))
          .take(BATCH_SIZE);
      }
    }

    // Delete associated streams in batches
    const BATCH_SIZE = 100;
    let streamsBatch = await ctx.db
      .query("streams")
      .withIndex("by_classId", (q) => q.eq("classId", id))
      .take(BATCH_SIZE);
    while (streamsBatch.length > 0) {
      for (let i = 0; i < streamsBatch.length; i++) {
        await ctx.db.delete(streamsBatch[i]._id);
      }
      streamsBatch = await ctx.db
        .query("streams")
        .withIndex("by_classId", (q) => q.eq("classId", id))
        .take(BATCH_SIZE);
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, cls.schoolId, "class.remove", { classId: id, force: !!force });
  },
});
