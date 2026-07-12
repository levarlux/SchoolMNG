import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireClassMembership,
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
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db.insert("classes", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("classes"),
    name: v.optional(v.string()),
    hasStreams: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireClassMembership(ctx, id);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("classes") },
  handler: async (ctx, { id }) => {
    await requireClassMembership(ctx, id);

    const studentsInClass = await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", id))
      .take(1);
    if (studentsInClass.length > 0) {
      throw new Error("Cannot delete class: students are still assigned to it. Reassign or remove them first.");
    }

    const streams = await ctx.db
      .query("streams")
      .withIndex("by_classId", (q) => q.eq("classId", id))
      .collect();
    for (const stream of streams) {
      await ctx.db.delete(stream._id);
    }
    await ctx.db.delete(id);
  },
});
