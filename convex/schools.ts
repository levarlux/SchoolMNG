import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSuperadmin, requireAuth } from "./helpers";



export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("schools").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

export const getByClerkOrgId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    return await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.string(),
    secondaryColor: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    return await ctx.db.insert("schools", args);
  },
});

// Read the school that belongs to the caller's Clerk organisation.
// The org ID is read from the JWT (server-side) so it can never be spoofed.
export const getMySchool = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    // Clerk embeds the active org as `org_id` in the JWT token
    const orgId = (identity as Record<string, unknown>)["org_id"] as string | undefined;
    if (!orgId) return null;
    return await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
      .first();
  },
});

// Update branding for the caller's own school (no need to pass an ID).
export const updateMySchool = mutation({
  args: {
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
  },
  handler: async (ctx, updates) => {
    const identity = await requireAuth(ctx);
    const orgId = (identity as Record<string, unknown>)["org_id"] as string | undefined;
    if (!orgId) throw new Error("No active organisation");
    const school = await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
      .first();
    if (!school) throw new Error("School not found for this organisation");
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(school._id, filtered);
    }
    return school._id;
  },
});

// Superadmin: update any school by ID.
export const update = mutation({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadmin(ctx);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

// Superadmin: delete a school by ID.
export const remove = mutation({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    await requireSuperadmin(ctx);
    await ctx.db.delete(id);
  },
});


