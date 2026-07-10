import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listByClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    return await ctx.db
      .query("streams")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .collect();
  },
});

export const create = mutation({
  args: {
    classId: v.id("classes"),
    name: v.string(),
  },
  handler: async (ctx, { classId, name }) => {
    return await ctx.db.insert("streams", { classId, name });
  },
});

export const remove = mutation({
  args: { id: v.id("streams") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
