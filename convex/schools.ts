import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuth,
  requireSuperadmin,
  requireSchoolMembership,
  requireSchoolFromJwt,
  assertValidHexColor,
} from "./helpers";

// ── Read-only queries ──────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("schools").take(500);
  },
});

/** Public-facing lookup by slug (school pages). Returns only safe fields. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!school) return null;
    // Strip sensitive fields before returning to an unauthenticated caller
    return {
      _id: school._id,
      name: school.name,
      slug: school.slug,
      logoUrl: school.logoUrl,
      primaryColor: school.primaryColor,
      secondaryColor: school.secondaryColor,
      accentColor: school.accentColor,
    };
  },
});

/**
 * @deprecated INTERNAL USE ONLY — call from functions that already verify schoolId via JWT.
 * Do NOT use in public query functions without verifying the caller belongs to this school.
 */
export const getByClerkOrgId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .first();
  },
});

/**
 * @deprecated INTERNAL USE ONLY — call from functions that already verify schoolId via JWT.
 * Do NOT use in public query functions without verifying the caller belongs to this school.
 */
export const getById = query({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
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
    assertValidHexColor(args.primaryColor, "primaryColor");
    assertValidHexColor(args.secondaryColor, "secondaryColor");
    return await ctx.db.insert("schools", args);
  },
});

// Read the school that belongs to the caller's Clerk organisation.
// The org ID is read from the JWT (server-side) so it can never be spoofed.
export const getMySchool = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireSchoolFromJwt(ctx);
    } catch {
      return null;
    }
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
    const school = await requireSchoolFromJwt(ctx);
    if (updates.primaryColor) assertValidHexColor(updates.primaryColor, "primaryColor");
    if (updates.secondaryColor) assertValidHexColor(updates.secondaryColor, "secondaryColor");
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
    if (updates.primaryColor) assertValidHexColor(updates.primaryColor, "primaryColor");
    if (updates.secondaryColor) assertValidHexColor(updates.secondaryColor, "secondaryColor");
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

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (classes.length > 0) {
      throw new Error("Cannot delete school: classes still exist. Delete or reassign them first.");
    }

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (students.length > 0) {
      throw new Error("Cannot delete school: students still exist. Delete or reassign them first.");
    }

    const activeBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", id).eq("status", "borrowed"))
      .take(1);
    if (activeBorrowings.length > 0) {
      throw new Error("Cannot delete school: active borrowings exist. Return all books first.");
    }

    await ctx.db.delete(id);
  },
});


