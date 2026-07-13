import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireClassMembership, requireSchoolMembership } from "./helpers";

export const listByClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    await requireClassMembership(ctx, classId);
    return await ctx.db
      .query("streams")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(100);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("streams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    name: v.string(),
  },
  handler: async (ctx, { schoolId, classId, name }) => {
    const cls = await requireClassMembership(ctx, classId);
    if (cls.schoolId !== schoolId) throw new Error("Class does not belong to this school");
    return await ctx.db.insert("streams", { schoolId, classId, name });
  },
});

export const remove = mutation({
  args: { id: v.id("streams") },
  handler: async (ctx, { id }) => {
    const stream = await ctx.db.get(id);
    if (!stream) throw new Error("Stream not found");
    await requireClassMembership(ctx, stream.classId);

    const studentsInStream = await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", stream.classId))
      .take(500);
    const hasStudents = studentsInStream.some((s) => s.streamId === id);
    if (hasStudents) {
      throw new Error("Cannot delete stream: students are still assigned to it. Reassign them first.");
    }

    await ctx.db.delete(id);
  },
});
