import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Transport Routes ──────────────────────────────────────────────

export const listRoutes = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("transport_routes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(100);
  },
});

export const createRoute = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    pickupPoints: v.array(v.string()),
    vehicleReg: v.optional(v.string()),
    driverName: v.optional(v.string()),
    driverPhone: v.optional(v.string()),
    capacity: v.number(),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Transport");
    return await ctx.db.insert("transport_routes", {
      ...args,
      isActive: true,
    });
  },
});

export const updateRoute = mutation({
  args: {
    id: v.id("transport_routes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    pickupPoints: v.optional(v.array(v.string())),
    vehicleReg: v.optional(v.string()),
    driverName: v.optional(v.string()),
    driverPhone: v.optional(v.string()),
    capacity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) throw new Error("Route not found");
    await requireModuleEditAccessByName(ctx, route.schoolId, "Transport");
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length > 0) await ctx.db.patch(id, updates);
  },
});

export const removeRoute = mutation({
  args: { id: v.id("transport_routes") },
  handler: async (ctx, args) => {
    const route = await ctx.db.get(args.id);
    if (!route) throw new Error("Route not found");
    await requireModuleEditAccessByName(ctx, route.schoolId, "Transport");
    await ctx.db.delete(args.id);
  },
});

// ── Route Logs ────────────────────────────────────────────────────

export const listLogsByDate = query({
  args: { schoolId: v.id("schools"), date: v.float64() },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("route_logs")
      .withIndex("by_schoolId_date", (q) =>
        q.eq("schoolId", args.schoolId).eq("date", args.date)
      )
      .take(100);
  },
});

export const createLog = mutation({
  args: {
    schoolId: v.id("schools"),
    routeId: v.id("transport_routes"),
    date: v.float64(),
    direction: v.union(v.literal("morning"), v.literal("evening")),
    studentCount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db.insert("route_logs", {
      ...args,
      recordedBy: identity?.subject ?? "system",
    });
  },
});

// ── Vehicle Maintenance ───────────────────────────────────────────

export const listMaintenance = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("vehicle_maintenance")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(100);
  },
});

export const createMaintenance = mutation({
  args: {
    schoolId: v.id("schools"),
    vehicleReg: v.string(),
    serviceType: v.string(),
    date: v.float64(),
    cost: v.optional(v.number()),
    provider: v.optional(v.string()),
    nextServiceDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Transport");
    return await ctx.db.insert("vehicle_maintenance", args);
  },
});

export const removeMaintenance = mutation({
  args: { id: v.id("vehicle_maintenance") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Transport");
    await ctx.db.delete(args.id);
  },
});
