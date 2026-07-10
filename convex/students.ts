import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .collect();
  },
});

export const listByClass = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    return await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .collect();
  },
});

export const getByAdmNo = query({
  args: { schoolId: v.id("schools"), admNo: v.string() },
  handler: async (ctx, { schoolId, admNo }) => {
    return await ctx.db
      .query("students")
      .withIndex("by_admNo", (q) => q.eq("schoolId", schoolId).eq("admNo", admNo))
      .first();
  },
});

export const get = query({
  args: { id: v.id("students") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const search = query({
  args: { schoolId: v.id("schools"), query: v.string() },
  handler: async (ctx, { schoolId, query }) => {
    if (!query.trim()) return [];
    return await ctx.db
      .query("students")
      .withSearchIndex("search_name", (q) => q.search("firstName", query))
      .filter((q) => q.eq(q.field("schoolId"), schoolId))
      .take(20);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    firstName: v.string(),
    lastName: v.string(),
    admNo: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("students", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("students"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    classId: v.optional(v.id("classes")),
    streamId: v.optional(v.id("streams")),
    admNo: v.optional(v.string()),
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
