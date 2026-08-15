import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

// ── Expenditures ─────────────────────────────────────────────────

export const listExpenditures = query({
  args: {
    schoolId: v.id("schools"),
    category: v.optional(v.string()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("expenditures")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    let results = await q.take(500);

    if (args.category) {
      results = results.filter((e) => e.category === args.category);
    }
    if (args.startDate) {
      results = results.filter((e) => e.date >= args.startDate!);
    }
    if (args.endDate) {
      results = results.filter((e) => e.date <= args.endDate!);
    }

    return results;
  },
});

export const getExpenditure = query({
  args: { id: v.id("expenditures") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createExpenditure = mutation({
  args: {
    schoolId: v.id("schools"),
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.float64(),
    paidTo: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("mobile_money"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("expenditures", {
      ...args,
      approvedBy: identity?.subject ?? "system",
    });

    // Update budget if one exists for this category
    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_category_term", (q) =>
        q.eq("category", args.category).eq("termId", "" as any)
      )
      .take(10);

    await logAuditEntry(ctx, args.schoolId, "expenditure.create", {
      expenditureId: id,
      amount: args.amount,
    });
    return id;
  },
});

export const updateExpenditure = mutation({
  args: {
    id: v.id("expenditures"),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    date: v.optional(v.float64()),
    paidTo: v.optional(v.string()),
    paymentMethod: v.optional(
      v.union(
        v.literal("cash"),
        v.literal("bank_transfer"),
        v.literal("cheque"),
        v.literal("mobile_money"),
        v.literal("other")
      )
    ),
    reference: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Expenditure not found");

    const patchData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patchData[key] = value;
    }

    await ctx.db.patch(id, patchData);
    await logAuditEntry(ctx, existing.schoolId, "expenditure.update", {
      expenditureId: id,
      ...patchData,
    });
  },
});

export const removeExpenditure = mutation({
  args: { id: v.id("expenditures") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Expenditure not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, existing.schoolId, "expenditure.remove", {
      expenditureId: args.id,
    });
  },
});

export const getExpenditureStats = query({
  args: { schoolId: v.id("schools"), termId: v.optional(v.id("terms")) },
  handler: async (ctx, args) => {
    const expenditures = await ctx.db
      .query("expenditures")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(5000);

    const total = expenditures.reduce((sum, e) => sum + e.amount, 0);

    // Group by category
    const byCategory: Record<string, number> = {};
    for (const exp of expenditures) {
      byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
    }

    return { total, byCategory, count: expenditures.length };
  },
});

// ── Budgets ─────────────────────────────────────────────────────

export const listBudgets = query({
  args: { schoolId: v.id("schools"), termId: v.optional(v.id("terms")) },
  handler: async (ctx, args) => {
    let results = await ctx.db
      .query("budgets")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(200);

    if (args.termId) {
      results = results.filter((b) => b.termId === args.termId);
    }
    return results;
  },
});

export const createBudget = mutation({
  args: {
    schoolId: v.id("schools"),
    category: v.string(),
    termId: v.id("terms"),
    allocatedAmount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("budgets", {
      ...args,
      spentAmount: 0,
    });
    await logAuditEntry(ctx, args.schoolId, "budget.create", {
      budgetId: id,
      category: args.category,
    });
    return id;
  },
});

export const updateBudget = mutation({
  args: {
    id: v.id("budgets"),
    allocatedAmount: v.optional(v.number()),
    spentAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Budget not found");

    const patchData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patchData[key] = value;
    }

    await ctx.db.patch(id, patchData);
  },
});

export const removeBudget = mutation({
  args: { id: v.id("budgets") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Budget not found");
    await ctx.db.delete(args.id);
  },
});

// ── Supplier Payments ───────────────────────────────────────────

export const listSupplierPayments = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("supplier_payments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    if (args.status) {
      return await q
        .filter((q) => q.eq("status", args.status))
        .take(500);
    }
    return await q.take(500);
  },
});

export const createSupplierPayment = mutation({
  args: {
    schoolId: v.id("schools"),
    supplierName: v.string(),
    invoiceNumber: v.string(),
    amount: v.number(),
    date: v.float64(),
    dueDate: v.float64(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("supplier_payments", {
      ...args,
      status: "pending",
      paidAmount: 0,
    });
    await logAuditEntry(ctx, args.schoolId, "supplier_payment.create", {
      paymentId: id,
    });
    return id;
  },
});

export const recordPayment = mutation({
  args: {
    id: v.id("supplier_payments"),
    paidAmount: v.number(),
    paymentMethod: v.string(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Supplier payment not found");

    const newPaidAmount = existing.paidAmount + args.paidAmount;
    const status =
      newPaidAmount >= existing.amount ? "paid" : "partial";

    await ctx.db.patch(args.id, {
      paidAmount: newPaidAmount,
      status: status as any,
      paidAt: Date.now(),
      paymentMethod: args.paymentMethod,
      reference: args.reference,
    });

    await logAuditEntry(ctx, existing.schoolId, "supplier_payment.record", {
      paymentId: args.id,
      amount: args.paidAmount,
    });
  },
});

export const removeSupplierPayment = mutation({
  args: { id: v.id("supplier_payments") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Supplier payment not found");
    await ctx.db.delete(args.id);
  },
});
