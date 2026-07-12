import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireSuperadmin } from "./helpers";

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
    const isSa = (identity as Record<string, unknown>)["publicMetadata"] as
      | { role?: string }
      | undefined;
    const callerIsSuperadmin = isSa?.role === "superadmin";
    if (!callerIsSuperadmin && identity.subject !== userId) {
      throw new Error("Not authorised to look up other users");
    }
    return await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
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
