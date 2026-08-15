import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    status: v.optional(
      v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed"))
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.status) {
      return await ctx.db
        .query("maintenance_tasks")
        .withIndex("by_status", (q) =>
          q.eq("schoolId", args.schoolId).eq("status", args.status!)
        )
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("maintenance_tasks")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("urgent")),
    assignedTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("maintenance_tasks", {
      ...args,
      status: "pending",
      reportedBy: identity?.subject ?? "system",
      reportedAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("maintenance_tasks"),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
    assignedTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    await requireSchoolMembership(ctx, task.schoolId);
    const updates: Record<string, unknown> = { status: args.status };
    if (args.assignedTo !== undefined) updates.assignedTo = args.assignedTo;
    if (args.status === "completed") updates.completedAt = Date.now();
    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("maintenance_tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");
    await requireSchoolMembership(ctx, task.schoolId);
    await ctx.db.delete(args.id);
  },
});
