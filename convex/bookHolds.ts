import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, logAuditEntry } from "./helpers";

export const listByBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("book_holds")
      .withIndex("by_bookId", (q) => q.eq("bookId", args.bookId))
      .take(50);
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("book_holds")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("book_holds")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    bookId: v.id("books"),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("book_holds", {
      schoolId: args.schoolId,
      bookId: args.bookId,
      studentId: args.studentId,
      status: "pending",
      requestedAt: Date.now(),
    });
    await logAuditEntry(ctx, args.schoolId, "bookHold.create", {
      holdId: id,
      bookId: args.bookId,
      studentId: args.studentId,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("book_holds"),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("fulfilled"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.id);
    if (!hold) throw new Error("Hold not found");
    await requireSchoolMembership(ctx, hold.schoolId);
    const updates: Record<string, unknown> = { status: args.status };
    if (args.status === "ready") updates.readyAt = Date.now();
    if (args.status === "fulfilled") updates.fulfilledAt = Date.now();
    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("book_holds") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.id);
    if (!hold) throw new Error("Hold not found");
    await requireSchoolMembership(ctx, hold.schoolId);
    await ctx.db.delete(args.id);
  },
});
