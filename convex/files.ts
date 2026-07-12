import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  requireAuth,
  requireSchoolMembership,
  requireSchoolFromJwt,
} from "./helpers";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Store the logo for the school that belongs to the caller's Clerk org.
// Reads org_id from the JWT — no client-supplied school ID needed.
export const setMyLogo = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { storageId }) => {
    const school = await requireSchoolFromJwt(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Upload not found");
    await ctx.db.patch(school._id, { logoUrl: url });
    return url;
  },
});

// Superadmin-only: set logo for any school by ID.
export const setLogo = mutation({
  args: {
    schoolId: v.id("schools"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { schoolId, storageId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Upload not found");
    await ctx.db.patch(schoolId, { logoUrl: url });
  },
});
