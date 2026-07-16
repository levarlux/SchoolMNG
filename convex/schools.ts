import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import {
  requireAuth,
  requireSuperadmin,
  requireSchoolMembership,
  requireSchoolFromJwt,
  assertValidHexColor,
  patchDefinedFields,
  logAuditEntry,
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
 * Lookup by Clerk org_id — used as a client-side fallback when the JWT
 * path is slow.  If the caller already has an org in their JWT, it
 * must match the requested clerkOrgId to prevent cross-tenant lookups.
 */
export const getByClerkOrgId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    const identity = await requireAuth(ctx);
    const jwtOrgId = (identity as Record<string, unknown>)["org_id"] as string | undefined;
    if (jwtOrgId && jwtOrgId !== clerkOrgId) {
      throw new Error("Not authorised for this school");
    }
    return await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .first();
  },
});

/**
 * INTERNAL ONLY — not callable from the client.  Used by server-side
 * actions that already verified superadmin status.
 */
export const getById = internalQuery({
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
    assertValidHexColor(args.primaryColor, "primaryColor");
    assertValidHexColor(args.secondaryColor, "secondaryColor");
    const schoolId = await ctx.db.insert("schools", args);
    await logAuditEntry(ctx, schoolId, "school.create", { name: args.name, slug: args.slug });
    return schoolId;
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
    await patchDefinedFields(ctx, "schools", school._id, updates);
    await logAuditEntry(ctx, school._id, "school.updateMySchool", updates);
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
    await patchDefinedFields(ctx, "schools", id, updates);
    await logAuditEntry(ctx, id, "school.update", updates);
  },
});

// Superadmin: delete a school by ID.
export const remove = mutation({
  args: {
    id: v.id("schools"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, force }) => {
    await requireSuperadmin(ctx);

    const BATCH_SIZE = 100;

    // Check for active borrowings first (never force-delete these)
    const activeBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", id).eq("status", "borrowed"))
      .take(1);
    if (activeBorrowings.length > 0) {
      throw new Error("Cannot delete school: active borrowings exist. Return all books first.");
    }

    // Check for classes
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (classes.length > 0 && !force) {
      throw new Error("Cannot delete school: classes still exist. Delete or reassign them first, or use force delete.");
    }

    // Check for students
    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (students.length > 0 && !force) {
      throw new Error("Cannot delete school: students still exist. Delete or reassign them first, or use force delete.");
    }

    if (force) {
      // Cascade: delete all students in this school
      let studentsBatch = await ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
        .take(BATCH_SIZE);
      while (studentsBatch.length > 0) {
        for (let i = 0; i < studentsBatch.length; i++) {
          await ctx.db.delete(studentsBatch[i]._id);
        }
        studentsBatch = await ctx.db
          .query("students")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
          .take(BATCH_SIZE);
      }

      // Cascade: delete all classes (and their streams) in this school
      let classesBatch = await ctx.db
        .query("classes")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
        .take(BATCH_SIZE);
      while (classesBatch.length > 0) {
        for (let i = 0; i < classesBatch.length; i++) {
          const classId = classesBatch[i]._id;
          // Delete streams for this class
          let streamsBatch = await ctx.db
            .query("streams")
            .withIndex("by_classId", (q) => q.eq("classId", classId))
            .take(BATCH_SIZE);
          while (streamsBatch.length > 0) {
            for (let j = 0; j < streamsBatch.length; j++) {
              await ctx.db.delete(streamsBatch[j]._id);
            }
            streamsBatch = await ctx.db
              .query("streams")
              .withIndex("by_classId", (q) => q.eq("classId", classId))
              .take(BATCH_SIZE);
          }
          await ctx.db.delete(classId);
        }
        classesBatch = await ctx.db
          .query("classes")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
          .take(BATCH_SIZE);
      }
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, id, "school.remove", { force: !!force });
  },
});