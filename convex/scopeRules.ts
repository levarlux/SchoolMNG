import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  requireSchoolMembership,
  getMemberRole,
  getLeadershipRoleKey,
  logAuditEntry,
} from "./helpers";

/**
 * Resolve the effective scope for a role within a bucket.
 * Returns the scope level, defaulting to "none" if no rule exists.
 *
 * Leadership (the school's principal / head-teacher role) is never scoped
 * down: it resolves to "all" regardless of stored rules, mirroring the
 * client-side `isLeadershipRole` gate used across the dashboard.
 */
export const resolveScope = query({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    bucket: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const role = await getMemberRole(ctx, args.schoolId);
    if (role === getLeadershipRoleKey()) return "all";
    const rule = await ctx.db
      .query("scopeRules")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .filter((q) => q.eq(q.field("bucket"), args.bucket))
      .first();
    return rule?.scope ?? "none";
  },
});

/**
 * List all scope rules for a role.
 */
export const listByRole = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scopeRules")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .take(100);
  },
});

/**
 * List all scope rules for a school.
 */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("scopeRules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(200);
  },
});

/**
 * Set (upsert) a scope rule for a role within a bucket.
 */
export const set = mutation({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    bucket: v.string(),
    scope: v.union(
      v.literal("all"),
      v.literal("assigned_class"),
      v.literal("assigned_subject_classes"),
      v.literal("own_record"),
      v.literal("own_children_only"),
      v.literal("lookup_on_demand"),
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    // Find existing rule
    const existing = await ctx.db
      .query("scopeRules")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .filter((q) => q.eq(q.field("bucket"), args.bucket))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { scope: args.scope });
    } else {
      await ctx.db.insert("scopeRules", {
        schoolId: args.schoolId,
        roleId: args.roleId,
        bucket: args.bucket,
        scope: args.scope,
      });
    }

    await logAuditEntry(ctx, args.schoolId, "scopeRule.set", {
      roleId: args.roleId,
      bucket: args.bucket,
      scope: args.scope,
    });
  },
});

/**
 * Remove a scope rule.
 */
export const remove = mutation({
  args: { id: v.id("scopeRules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Scope rule not found");
    await requireSchoolMembership(ctx, rule.schoolId);
    await ctx.db.delete(args.id);
  },
});
