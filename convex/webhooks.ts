import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
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

/**
 * Handle organizationMembership.created and organizationMembership.deleted events.
 * Creates or removes member rows in the members table.
 */
export const handleMembershipEvent = mutation({
  args: {
    secret: v.string(),
    event: v.string(),
    data: v.object({
      orgId: v.string(),
      userId: v.string(),
      email: v.optional(v.string()),
      publicMetadata: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { secret, event, data }) => {
    if (secret !== process.env.CLERK_WEBHOOK_SECRET) {
      log("warn", "webhooks", "Invalid webhook secret received", { event, orgId: data.orgId });
      throw new Error("Invalid webhook secret");
    }

    const school = await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", data.orgId))
      .first();
    if (!school) {
      log("warn", "webhooks", "No school found for org", { orgId: data.orgId });
      return { ok: false, reason: "School not found for this organization" };
    }

    if (event === "organizationMembership.created") {
      const appRole = data.publicMetadata?.appRole;
      const role = appRole === "principal" ? "principal" : "teacher";

      await ctx.runMutation(internal.members.addFromWebhook, {
        userId: data.userId,
        schoolId: school._id,
        email: data.email,
        role,
      });

      log("info", "webhooks", "Membership created", {
        orgId: data.orgId,
        userId: data.userId,
      });
      return { ok: true };
    }

    if (event === "organizationMembership.deleted") {
      const member = await ctx.db
        .query("members")
        .withIndex("by_userId_and_schoolId", (q) =>
          q.eq("userId", data.userId).eq("schoolId", school._id)
        )
        .first();
      if (member) {
        await ctx.db.delete(member._id);
        log("info", "webhooks", "Membership removed", {
          orgId: data.orgId,
          userId: data.userId,
        });
      }
      return { ok: true };
    }

    return { ok: true };
  },
});