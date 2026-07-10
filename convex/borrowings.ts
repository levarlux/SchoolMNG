import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .collect();
  },
});

export const listActive = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "borrowed"))
      .collect();
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    return await ctx.db
      .query("borrowings")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    bookName: v.string(),
    bookNumber: v.string(),
    dueDate: v.float64(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("borrowings", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      bookName: args.bookName,
      bookNumber: args.bookNumber,
      borrowedAt: now,
      dueDate: args.dueDate,
      returnedAt: undefined,
      status: "borrowed",
    });
  },
});

export const markReturned = mutation({
  args: { id: v.id("borrowings") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, {
      returnedAt: Date.now(),
      status: "returned",
    });
  },
});
