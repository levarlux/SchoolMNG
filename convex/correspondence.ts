import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    direction: v.optional(
      v.union(v.literal("incoming"), v.literal("outgoing"))
    ),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("correspondence")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    let results = await q.take(500);

    if (args.direction) {
      results = results.filter((c) => c.direction === args.direction);
    }
    if (args.status) {
      results = results.filter((c) => c.status === args.status);
    }

    return results;
  },
});

export const get = query({
  args: { id: v.id("correspondence") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    direction: v.union(v.literal("incoming"), v.literal("outgoing")),
    referenceNumber: v.string(),
    date: v.float64(),
    fromTo: v.string(),
    subject: v.string(),
    summary: v.optional(v.string()),
    category: v.string(),
    assignedTo: v.optional(v.string()),
    attachmentUrls: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("correspondence", {
      ...args,
      status: "received",
    });
    await logAuditEntry(ctx, args.schoolId, "correspondence.create", {
      correspondenceId: id,
    });
    return id;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("correspondence"),
    status: v.union(
      v.literal("received"),
      v.literal("pending_action"),
      v.literal("actioned"),
      v.literal("filed")
    ),
    assignedTo: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Correspondence not found");

    const patchData: Record<string, any> = { status: args.status };
    if (args.assignedTo !== undefined) patchData.assignedTo = args.assignedTo;
    if (args.notes !== undefined) patchData.notes = args.notes;

    await ctx.db.patch(args.id, patchData);
    await logAuditEntry(ctx, existing.schoolId, "correspondence.status_update", {
      correspondenceId: args.id,
      status: args.status,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("correspondence") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Correspondence not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, existing.schoolId, "correspondence.remove", {
      correspondenceId: args.id,
    });
  },
});

export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("correspondence")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);

    return {
      total: items.length,
      incoming: items.filter((c) => c.direction === "incoming").length,
      outgoing: items.filter((c) => c.direction === "outgoing").length,
      pending: items.filter((c) => c.status === "pending_action").length,
      filed: items.filter((c) => c.status === "filed").length,
    };
  },
});
