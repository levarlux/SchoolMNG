import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("academicYears")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(50);
  },
});

export const getActive = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("academicYears")
      .withIndex("by_schoolId_status", (q) =>
        q.eq("schoolId", args.schoolId).eq("status", "active")
      )
      .first();
  },
});

export const get = query({
  args: { id: v.id("academicYears") },
  handler: async (ctx, args) => {
    const year = await ctx.db.get(args.id);
    if (!year) throw new Error("Academic year not found");
    await requireSchoolMembership(ctx, year.schoolId);
    return year;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    label: v.string(),
    startDate: v.float64(),
    endDate: v.float64(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const id = await ctx.db.insert("academicYears", {
      schoolId: args.schoolId,
      label: args.label,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "upcoming",
    });
    await logAuditEntry(ctx, args.schoolId, "academicYear.create", {
      academicYearId: id,
      label: args.label,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("academicYears"),
    label: v.optional(v.string()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    status: v.optional(
      v.union(v.literal("upcoming"), v.literal("active"), v.literal("closed"))
    ),
  },
  handler: async (ctx, args) => {
    const year = await ctx.db.get(args.id);
    if (!year) throw new Error("Academic year not found");
    await requirePrincipal(ctx, year.schoolId);

    // If setting to active, deactivate any currently active year
    if (args.status === "active") {
      const currentActive = await ctx.db
        .query("academicYears")
        .withIndex("by_schoolId_status", (q) =>
          q.eq("schoolId", year.schoolId).eq("status", "active")
        )
        .first();
      if (currentActive && currentActive._id !== args.id) {
        await ctx.db.patch(currentActive._id, { status: "closed" });
      }
    }

    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.label !== undefined) updates.label = fields.label;
    if (fields.startDate !== undefined) updates.startDate = fields.startDate;
    if (fields.endDate !== undefined) updates.endDate = fields.endDate;
    if (fields.status !== undefined) updates.status = fields.status;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, year.schoolId, "academicYear.update", {
      academicYearId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("academicYears") },
  handler: async (ctx, args) => {
    const year = await ctx.db.get(args.id);
    if (!year) throw new Error("Academic year not found");
    await requirePrincipal(ctx, year.schoolId);

    // Check if any terms reference this year
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_academicYearId", (q) => q.eq("academicYearId", args.id))
      .take(1);
    if (terms.length > 0) {
      throw new Error("Cannot delete academic year: terms are linked to it.");
    }

    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, year.schoolId, "academicYear.remove", {
      academicYearId: args.id,
      label: year.label,
    });
  },
});

/**
 * Activate an academic year — closes the previous active year,
 * sets this one to active, and activates its first term (if any).
 */
export const activate = mutation({
  args: { id: v.id("academicYears") },
  handler: async (ctx, args) => {
    const year = await ctx.db.get(args.id);
    if (!year) throw new Error("Academic year not found");
    await requirePrincipal(ctx, year.schoolId);

    // Close any currently active year
    const currentActive = await ctx.db
      .query("academicYears")
      .withIndex("by_schoolId_status", (q) =>
        q.eq("schoolId", year.schoolId).eq("status", "active")
      )
      .first();
    if (currentActive && currentActive._id !== args.id) {
      await ctx.db.patch(currentActive._id, { status: "closed" });
      // Also close all terms in the old year
      const oldTerms = await ctx.db
        .query("terms")
        .withIndex("by_academicYearId", (q) =>
          q.eq("academicYearId", currentActive._id)
        )
        .take(10);
      for (const term of oldTerms) {
        if (term.status === "active") {
          await ctx.db.patch(term._id, { status: "closed" });
        }
      }
    }

    // Activate this year
    await ctx.db.patch(args.id, { status: "active" });

    // Activate the first upcoming term in this year
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_academicYearId", (q) => q.eq("academicYearId", args.id))
      .order("asc")
      .take(10);
    const upcomingTerm = terms.find((t) => t.status === "upcoming");
    if (upcomingTerm) {
      await ctx.db.patch(upcomingTerm._id, { status: "active" });
    }

    await logAuditEntry(ctx, year.schoolId, "academicYear.activate", {
      academicYearId: args.id,
    });
  },
});
