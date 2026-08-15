import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Medical Supplies ──────────────────────────────────────────────

export const listSupplies = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("medical_supplies")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(200);
  },
});

export const createSupply = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    category: v.string(),
    quantity: v.number(),
    unit: v.string(),
    minStock: v.number(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    return await ctx.db.insert("medical_supplies", {
      ...args,
      lastRestocked: Date.now(),
    });
  },
});

export const updateSupply = mutation({
  args: {
    id: v.id("medical_supplies"),
    quantity: v.optional(v.number()),
    minStock: v.optional(v.number()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const supply = await ctx.db.get(args.id);
    if (!supply) throw new Error("Supply not found");
    await requireModuleEditAccessByName(ctx, supply.schoolId, "Health/Welfare");
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.quantity !== undefined) updates.quantity = fields.quantity;
    if (fields.minStock !== undefined) updates.minStock = fields.minStock;
    if (fields.location !== undefined) updates.location = fields.location;
    if (Object.keys(updates).length > 0) await ctx.db.patch(id, updates);
  },
});

export const restock = mutation({
  args: { id: v.id("medical_supplies"), addQuantity: v.number() },
  handler: async (ctx, args) => {
    const supply = await ctx.db.get(args.id);
    if (!supply) throw new Error("Supply not found");
    await requireModuleEditAccessByName(ctx, supply.schoolId, "Health/Welfare");
    await ctx.db.patch(args.id, {
      quantity: supply.quantity + args.addQuantity,
      lastRestocked: Date.now(),
    });
  },
});

export const removeSupply = mutation({
  args: { id: v.id("medical_supplies") },
  handler: async (ctx, args) => {
    const supply = await ctx.db.get(args.id);
    if (!supply) throw new Error("Supply not found");
    await requireModuleEditAccessByName(ctx, supply.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Vaccination Records ───────────────────────────────────────────

export const listVaccinationsByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaccination_records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const listVaccinationsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("vaccination_records")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

export const createVaccination = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    vaccineName: v.string(),
    dateGiven: v.float64(),
    nextDueDate: v.optional(v.float64()),
    batchNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("vaccination_records", {
      ...args,
      administeredBy: identity?.subject ?? "system",
    });
  },
});

export const removeVaccination = mutation({
  args: { id: v.id("vaccination_records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});
