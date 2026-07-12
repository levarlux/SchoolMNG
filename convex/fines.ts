import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireStudentMembership,
  requireBorrowingMembership,
} from "./helpers";

// ── Queries ────────────────────────────────────────────────────────

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(v.union(v.literal("unpaid"), v.literal("paid"), v.literal("waived"))),
  },
  handler: async (ctx, { schoolId, status }) => {
    await requireSchoolMembership(ctx, schoolId);
    if (status) {
      return await ctx.db
        .query("fines")
        .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", status))
        .order("desc")
        .take(500);
    }
    return await ctx.db
      .query("fines")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(500);
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    await requireStudentMembership(ctx, studentId);
    return await ctx.db
      .query("fines")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(200);
  },
});

export const listUnpaid = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("fines")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "unpaid"))
      .order("desc")
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("fines") },
  handler: async (ctx, { id }) => {
    const fine = await ctx.db.get(id);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);
    return fine;
  },
});

export const getPayments = query({
  args: { fineId: v.id("fines") },
  handler: async (ctx, { fineId }) => {
    const fine = await ctx.db.get(fineId);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);
    return await ctx.db
      .query("fine_payments")
      .withIndex("by_fineId", (q) => q.eq("fineId", fineId))
      .order("desc")
      .take(100);
  },
});

// ── Mutations ──────────────────────────────────────────────────────

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    borrowingId: v.id("borrowings"),
    studentId: v.id("students"),
    amount: v.number(),
    reason: v.union(v.literal("overdue"), v.literal("lost"), v.literal("damaged")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    await requireStudentMembership(ctx, args.studentId);
    await requireBorrowingMembership(ctx, args.borrowingId);
    if (args.amount <= 0) throw new Error("Fine amount must be positive");

    const borrowing = await ctx.db.get(args.borrowingId);
    if (!borrowing) throw new Error("Borrowing not found");

    if (borrowing.studentId !== args.studentId) {
      throw new Error("Fine studentId does not match borrowing's student");
    }

    if (args.reason === "overdue" && borrowing.status === "returned") {
      throw new Error("Cannot create overdue fine for returned borrowing");
    }

    return await ctx.db.insert("fines", {
      schoolId: args.schoolId,
      borrowingId: args.borrowingId,
      studentId: args.studentId,
      amount: args.amount,
      reason: args.reason,
      status: "unpaid",
      paidAmount: 0,
      createdAt: Date.now(),
      note: args.note,
    });
  },
});

export const markPaid = mutation({
  args: {
    id: v.id("fines"),
    amount: v.number(),
    method: v.union(v.literal("cash"), v.literal("mobile_money"), v.literal("bank_transfer"), v.literal("other")),
    receivedBy: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, { id, amount, method, receivedBy, reference }) => {
    const fine = await ctx.db.get(id);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);

    if (fine.status !== "unpaid") {
      throw new Error("Can only pay unpaid fines");
    }

    if (amount <= 0) throw new Error("Payment amount must be positive");

    const newPaidAmount = fine.paidAmount + amount;
    if (newPaidAmount > fine.amount) {
      throw new Error(`Payment exceeds fine balance. Outstanding: ${fine.amount - fine.paidAmount}`);
    }

    await ctx.db.insert("fine_payments", {
      schoolId: fine.schoolId,
      fineId: id,
      amount,
      method,
      receivedBy,
      receivedAt: Date.now(),
      reference,
    });

    await ctx.db.patch(id, {
      paidAmount: newPaidAmount,
      status: newPaidAmount >= fine.amount ? "paid" : "unpaid",
      paidAt: newPaidAmount >= fine.amount ? Date.now() : undefined,
    });

    return { ok: true, fullyPaid: newPaidAmount >= fine.amount };
  },
});

export const markWaived = mutation({
  args: {
    id: v.id("fines"),
    waivedBy: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, waivedBy, note }) => {
    const fine = await ctx.db.get(id);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);

    if (fine.status !== "unpaid") {
      throw new Error("Can only waive unpaid fines");
    }

    await ctx.db.patch(id, {
      status: "waived",
      waivedAt: Date.now(),
      waivedBy,
      note: note ?? fine.note,
    });
  },
});

export const updateNote = mutation({
  args: {
    id: v.id("fines"),
    note: v.string(),
  },
  handler: async (ctx, { id, note }) => {
    const fine = await ctx.db.get(id);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);
    await ctx.db.patch(id, { note });
  },
});

export const remove = mutation({
  args: { id: v.id("fines") },
  handler: async (ctx, { id }) => {
    const fine = await ctx.db.get(id);
    if (!fine) throw new Error("Fine not found");
    await requireSchoolMembership(ctx, fine.schoolId);
    // Delete associated payments first
    const payments = await ctx.db
      .query("fine_payments")
      .withIndex("by_fineId", (q) => q.eq("fineId", id))
      .collect();
    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }
    await ctx.db.delete(id);
  },
});
