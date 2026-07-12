import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuth,
  requireSchoolMembership,
  requireStudentMembership,
  requireBorrowingMembership,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(500);
  },
});

export const listActive = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "borrowed"))
      .take(500);
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    const student = await requireStudentMembership(ctx, studentId);
    return await ctx.db
      .query("borrowings")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    bookName: v.string(),
    bookNumber: v.string(),
    dueDate: v.float64(),
    bookId: v.optional(v.id("books")),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    await requireStudentMembership(ctx, args.studentId);

    if (args.bookId) {
      const book = await ctx.db.get(args.bookId);
      if (!book) {
        console.error("[borrowings.create] Book not found:", args.bookId);
        throw new Error("Book not found");
      }
      if (book.schoolId !== args.schoolId) {
        console.error("[borrowings.create] Book does not belong to school:", args.bookId);
        throw new Error("Book does not belong to this school");
      }
      if (book.availableCopies <= 0) {
        console.error("[borrowings.create] No copies available for book:", args.bookId);
        throw new Error("No copies available");
      }
      await ctx.db.patch(args.bookId, {
        availableCopies: book.availableCopies - 1,
      });
    }

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
      bookId: args.bookId,
    });
  },
});

export const markReturned = mutation({
  args: { id: v.id("borrowings") },
  handler: async (ctx, { id }) => {
    await requireBorrowingMembership(ctx, id);
    const borrowing = await ctx.db.get(id);
    if (!borrowing) {
      console.error("[borrowings.markReturned] Borrowing not found:", id);
      throw new Error("Borrowing not found");
    }

    await ctx.db.patch(id, {
      returnedAt: Date.now(),
      status: "returned",
    });

    if (borrowing.bookId) {
      const book = await ctx.db.get(borrowing.bookId);
      if (book) {
        const newAvailable = book.availableCopies + 1;
        const maxCopies = book.totalCopies ?? newAvailable;
        await ctx.db.patch(borrowing.bookId, {
          availableCopies: Math.min(newAvailable, maxCopies),
        });
      }
    }
  },
});
