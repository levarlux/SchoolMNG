import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { log } from "./lib/logger";

/**
 * Public mutation that the Clerk webhook handler calls.
 * Protected by a shared secret — NOT by auth, since webhooks have no user context.
 * The secret is checked server-side so only the verified webhook can invoke this.
 */
export const handleOrganizationEvent = mutation({
  args: {
    secret: v.string(),
    event: v.string(),
    data: v.object({
      id: v.string(),
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { secret, event, data }) => {
    if (secret !== process.env.CLERK_WEBHOOK_SECRET) {
      log("warn", "webhooks", "Invalid webhook secret received", { event, orgId: data.id });
      throw new Error("Invalid webhook secret");
    }

    if (event === "organization.created") {
      const existing = await ctx.db
        .query("schools")
        .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", data.id))
        .first();
      if (!existing) {
        await ctx.db.insert("schools", {
          clerkOrgId: data.id,
          name: data.name ?? "",
          slug: data.slug ?? "",
          primaryColor: "#2563eb",
          secondaryColor: "#64748b",
        });
        log("info", "webhooks", "School created from webhook", { orgId: data.id, name: data.name });
      }
    }

    if (event === "organization.updated") {
      const school = await ctx.db
        .query("schools")
        .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", data.id))
        .first();
      if (school) {
        const updates: Record<string, string> = {};
        if (data.name) updates.name = data.name;
        if (data.slug) updates.slug = data.slug;
        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(school._id, updates);
          log("info", "webhooks", "School updated from webhook", { orgId: data.id, ...updates });
        }
      }
    }

    if (event === "organization.deleted") {
      const school = await ctx.db
        .query("schools")
        .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", data.id))
        .first();
      if (school) {
        const classes = await ctx.db
          .query("classes")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
          .take(1);
        if (classes.length > 0) {
          log("warn", "webhooks", "School deletion blocked: classes still exist. Manual cleanup required.", { orgId: data.id, schoolId: school._id });
          return { ok: false, reason: "School has dependent classes" };
        }

        const students = await ctx.db
          .query("students")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
          .take(1);
        if (students.length > 0) {
          log("warn", "webhooks", "School deletion blocked: students still exist. Manual cleanup required.", { orgId: data.id, schoolId: school._id });
          return { ok: false, reason: "School has dependent students" };
        }

        await ctx.db.delete(school._id);
        log("info", "webhooks", "School deleted from webhook", { orgId: data.id, schoolId: school._id });
      }
    }

    return { ok: true };
  },
});