import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { requireAuth, requireSuperadmin } from "./helpers";

/**
 * Internal-only: look up admin by userId. No auth check — used by
 * action-level superadmin verification that already checked auth.
 */
export const getByUserIdInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * DEBUG: Returns the raw identity fields so we can see what Clerk
 * actually puts in the JWT. Remove after diagnosing.
 */
export const debugIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
      issuer: identity.issuer,
      tokenIdentifier: identity.tokenIdentifier,
      organizationId: identity.organizationId,
      allKeys: Object.keys(identity),
      raw: JSON.parse(JSON.stringify(identity)),
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("admins").take(200);
  },
});

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const identity = await requireAuth(ctx);
    const raw = identity as Record<string, unknown>;
    const meta = (raw["publicMetadata"] ?? raw["public_metadata"]) as { role?: string } | undefined;
    const callerIsSuperadmin = meta?.role === "superadmin";
    if (!callerIsSuperadmin && identity.subject !== userId) {
      throw new Error("Not authorised to look up other users");
    }
    return await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Auto-bootstrap: if the caller's JWT says they're a superadmin but no
 * admins record exists yet, create one. Safe to call repeatedly — idempotent.
 */
export const ensureSuperadmin = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);

    // Already exists — nothing to do
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();
    if (existing) return existing._id;

    // Check JWT metadata for the role
    const raw = identity as Record<string, unknown>;
    const meta = (raw["publicMetadata"] ?? raw["public_metadata"]) as { role?: string } | undefined;
    if (meta?.role !== "superadmin") {
      throw new Error("Not a superadmin");
    }

    return await ctx.db.insert("admins", {
      userId: identity.subject,
      email: identity.email ?? "",
      role: "superadmin",
    });
  },
});

export const create = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    return await ctx.db.insert("admins", { ...args, role: "superadmin" });
  },
});

export const remove = mutation({
  args: { id: v.id("admins") },
  handler: async (ctx, { id }) => {
    await requireSuperadmin(ctx);
    await ctx.db.delete(id);
  },
});
