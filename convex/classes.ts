import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("classes") },
  handler: async (ctx, { id }) => {
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
