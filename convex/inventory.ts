import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requirePrincipal,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("inventory_items")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);
  },
});

export const listByCategory = query({
  args: { schoolId: v.id("schools"), category: v.string() },
  handler: async (ctx, { schoolId, category }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("inventory_items")
      .withIndex("by_category", (q) => q.eq("schoolId", schoolId).eq("category", category))
      .take(500);
  },
});

export const get = query({
  args: { id: v.id("inventory_items") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new Error("Inventory item not found");
    await requireSchoolMembership(ctx, item.schoolId);
    return item;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    quantity: v.number(),
    condition: v.union(
      v.literal("good"),
      v.literal("fair"),
      v.literal("poor"),
      v.literal("damaged"),
    ),
    location: v.optional(v.string()),
    purchaseDate: v.optional(v.float64()),
    purchasePrice: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const itemId = await ctx.db.insert("inventory_items", {
      ...args,
      lastChecked: Date.now(),
    });
    await logAuditEntry(ctx, args.schoolId, "inventory.create", {
      itemId,
      name: args.name,
      category: args.category,
    });
    return itemId;
  },
});

export const update = mutation({
  args: {
    id: v.id("inventory_items"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    condition: v.optional(
      v.union(
        v.literal("good"),
        v.literal("fair"),
        v.literal("poor"),
        v.literal("damaged"),
      )
    ),
    location: v.optional(v.string()),
    purchaseDate: v.optional(v.float64()),
    purchasePrice: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new Error("Inventory item not found");
    await requirePrincipal(ctx, item.schoolId);
    await patchDefinedFields(ctx, "inventory_items", id, updates);
    await logAuditEntry(ctx, item.schoolId, "inventory.update", { itemId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("inventory_items") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) throw new Error("Inventory item not found");
    await requirePrincipal(ctx, item.schoolId);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, item.schoolId, "inventory.remove", { itemId: id });
  },
});

export const getSummary = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const items = await ctx.db
      .query("inventory_items")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(2000);

    const byCategory: Record<string, number> = {};
    const byCondition: Record<string, number> = {};
    let totalValue = 0;

    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.quantity;
      byCondition[item.condition] = (byCondition[item.condition] || 0) + item.quantity;
      if (item.purchasePrice) {
        totalValue += item.purchasePrice * item.quantity;
      }
    }

    return {
      totalItems: items.length,
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
      byCategory,
      byCondition,
      totalValue,
    };
  },
});
