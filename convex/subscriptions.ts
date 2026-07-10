import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSuperadmin } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("subscriptions").collect();
  },
});

export const getBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSuperadmin(ctx);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    planType: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("cancelled"), v.literal("past_due")),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    return await ctx.db.insert("subscriptions", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("subscriptions"),
    planType: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("cancelled"), v.literal("past_due"))),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});
