import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: { 
    schoolId: v.id("schools"), 
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("waitlisted"),
    ))
  },
  handler: async (ctx, args) => {
    // Use by_status index when filtering by status (avoids post-fetch filtering)
    if (args.status) {
      return await ctx.db
        .query("admission_applications")
        .withIndex("by_status", (q) => q.eq("schoolId", args.schoolId).eq("status", args.status!))
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("admission_applications")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const listByClass = query({
  args: { schoolId: v.id("schools"), classId: v.id("classes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("admission_applications")
      .withIndex("by_desiredClassId", (q) =>
        q.eq("desiredClassId", args.classId)
      )
      .take(500);
  },
});

export const get = query({
  args: { id: v.id("admission_applications") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    applicantName: v.string(),
    dateOfBirth: v.float64(),
    gender: v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    previousSchool: v.optional(v.string()),
    guardianName: v.string(),
    guardianPhone: v.string(),
    guardianEmail: v.optional(v.string()),
    desiredClassId: v.id("classes"),
    notes: v.optional(v.string()),
    documents: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("admission_applications", {
      ...args,
      applicationDate: Date.now(),
      status: "pending",
    });
    await logAuditEntry(ctx, args.schoolId, "admission.create", {
      applicationId: id,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("admission_applications"),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("waitlisted")
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");

    await ctx.db.patch(args.id, {
      status: args.status,
      reviewedBy: (await ctx.auth.getUserIdentity())?.subject,
      reviewedAt: Date.now(),
      ...(args.notes ? { notes: args.notes } : {}),
    });
    await logAuditEntry(ctx, app.schoolId, "admission.status_update", {
      applicationId: args.id,
      status: args.status,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("admission_applications") },
  handler: async (ctx, args) => {
    const app = await ctx.db.get(args.id);
    if (!app) throw new Error("Application not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, app.schoolId, "admission.remove", {
      applicationId: args.id,
    });
  },
});

export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const apps = await ctx.db
      .query("admission_applications")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(2000);

    const stats = {
      total: apps.length,
      pending: apps.filter((a) => a.status === "pending").length,
      underReview: apps.filter((a) => a.status === "under_review").length,
      accepted: apps.filter((a) => a.status === "accepted").length,
      rejected: apps.filter((a) => a.status === "rejected").length,
      waitlisted: apps.filter((a) => a.status === "waitlisted").length,
    };
    return stats;
  },
});
