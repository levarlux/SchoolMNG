import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requirePrincipal,
  requireBookMembership,
  patchDefinedFields,
  logAuditEntry,
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
    await requirePrincipal(ctx, args.schoolId);
    if (args.availableCopies < 0) {
      throw new Error("availableCopies must be >= 0");
    }
    if (args.totalCopies !== undefined && args.totalCopies < args.availableCopies) {
      throw new Error("totalCopies must be >= availableCopies");
    }
    const bookId = await ctx.db.insert("books", args);
    await logAuditEntry(ctx, args.schoolId, "book.create", {
      bookId,
      title: args.title,
      author: args.author,
    });
    return bookId;
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
    const book = await requireBookMembership(ctx, id);
    await requirePrincipal(ctx, book.schoolId);

    if (updates.availableCopies !== undefined && updates.availableCopies < 0) {
      throw new Error("availableCopies must be >= 0");
    }

    if (updates.availableCopies !== undefined || updates.totalCopies !== undefined) {
      const effectiveAvailable = updates.availableCopies ?? book.availableCopies;
      const effectiveTotal = updates.totalCopies ?? book.totalCopies;
      if (effectiveTotal !== undefined && effectiveAvailable > effectiveTotal) {
        throw new Error("availableCopies must be <= totalCopies");
      }
    }

    await patchDefinedFields(ctx, "books", id, updates);
    await logAuditEntry(ctx, book.schoolId, "book.update", { bookId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("books") },
  handler: async (ctx, { id }) => {
    const book = await requireBookMembership(ctx, id);
    await requirePrincipal(ctx, book.schoolId);
    if (!book) throw new Error("Book not found");

    const activeBorrowals = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", book.schoolId).eq("status", "borrowed"))
      .take(500);
    const hasActive = activeBorrowals.some(b => b.bookId === id || (!b.bookId && b.bookName === book.title));
    if (hasActive) {
      throw new Error("Cannot delete book: there are active borrowings for this book. Return them first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, book.schoolId, "book.remove", { bookId: id, title: book.title });
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
    await requirePrincipal(ctx, schoolId);
    let count = 0;
    for (const book of books) {
      await ctx.db.insert("books", { schoolId, ...book });
      count++;
    }
    await logAuditEntry(ctx, schoolId, "book.bulkCreate", { count });
    return { count };
  },
});