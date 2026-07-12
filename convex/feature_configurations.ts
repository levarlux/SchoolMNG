import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireSchoolFromJwt,
  requireSuperadmin,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("feature_configurations")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200);
  },
});

export const getByFeature = query({
  args: { schoolId: v.id("schools"), featureName: v.string() },
  handler: async (ctx, { schoolId, featureName }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("feature_configurations")
      .withIndex("by_feature", (q) => q.eq("schoolId", schoolId).eq("featureName", featureName))
      .first();
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    featureName: v.string(),
    isEnabled: v.boolean(),
    config: v.any(),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    return await ctx.db.insert("feature_configurations", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("feature_configurations"),
    isEnabled: v.optional(v.boolean()),
    config: v.optional(v.any()),
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

export const remove = mutation({
  args: { id: v.id("feature_configurations") },
  handler: async (ctx, { id }) => {
    await requireSuperadmin(ctx);
    await ctx.db.delete(id);
  },
});

export const featureFlags = query({
  args: {},
  handler: async (ctx) => {
    const school = await requireSchoolFromJwt(ctx);
    const features = await ctx.db
      .query("feature_configurations")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
      .collect();
    const flags: Record<string, boolean> = {};
    for (const f of features) {
      flags[f.featureName] = f.isEnabled;
    }
    return flags;
  },
});
