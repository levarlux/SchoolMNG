import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuth } from "./helpers";

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
    const identity = await requireAuth(ctx);
    const orgId = (identity as Record<string, unknown>)["org_id"] as string | undefined;
    if (!orgId) throw new Error("No active organisation");

    const school = await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
      .first();
    if (!school) throw new Error("School not found for this organisation");

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Upload not found");

    await ctx.db.patch(school._id, { logoUrl: url });
    return url;
  },
});

// Legacy: accepts an explicit school ID (for superadmin use).
export const setLogo = mutation({
  args: {
    schoolId: v.id("schools"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { schoolId, storageId }) => {
    await requireAuth(ctx);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Upload not found");
    await ctx.db.patch(schoolId, { logoUrl: url });
  },
});
