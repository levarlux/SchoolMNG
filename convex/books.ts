import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireBookMembership,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("books")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);
  },
});

export const get = query({
  args: { id: v.id("books") },
  handler: async (ctx, { id }) => {
    await requireBookMembership(ctx, id);
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
    author: v.string(),
    availableCopies: v.number(),
    totalCopies: v.optional(v.number()),
    isbn: v.optional(v.string()),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db.insert("books", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("books"),
    title: v.optional(v.string()),
    author: v.optional(v.string()),
    availableCopies: v.optional(v.number()),
    totalCopies: v.optional(v.number()),
    isbn: v.optional(v.string()),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireBookMembership(ctx, id);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, { id }) => {
    await requireBookMembership(ctx, id);
    await ctx.db.delete(id);
  },
});

const bookRowValidator = v.object({
  title: v.string(),
  author: v.string(),
  availableCopies: v.number(),
  totalCopies: v.optional(v.number()),
  isbn: v.optional(v.string()),
  subject: v.optional(v.string()),
});

export const bulkCreate = mutation({
  args: {
    schoolId: v.id("schools"),
    books: v.array(bookRowValidator),
  },
  handler: async (ctx, { schoolId, books }) => {
    await requireSchoolMembership(ctx, schoolId);
    let count = 0;
    for (const book of books) {
      await ctx.db.insert("books", { schoolId, ...book });
      count++;
    }
    return { count };
  },
});
