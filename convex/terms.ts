import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requirePrincipal,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);
  },
});

export const getCurrent = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("terms")
      .withIndex("by_current", (q) => q.eq("schoolId", schoolId).eq("isCurrent", true))
      .first();
  },
});

export const get = query({
  args: { id: v.id("terms") },
  handler: async (ctx, { id }) => {
    const term = await ctx.db.get(id);
    if (!term) throw new Error("Term not found");
    await requireSchoolMembership(ctx, term.schoolId);
    return term;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    year: v.number(),
    startDate: v.float64(),
    endDate: v.float64(),
    isCurrent: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);

    if (args.isCurrent) {
      const currentTerm = await ctx.db
        .query("terms")
        .withIndex("by_current", (q) => q.eq("schoolId", args.schoolId).eq("isCurrent", true))
        .first();
      if (currentTerm) {
        await ctx.db.patch(currentTerm._id, { isCurrent: false });
      }
    }

    const termId = await ctx.db.insert("terms", args);
    await logAuditEntry(ctx, args.schoolId, "term.create", {
      termId,
      name: args.name,
      year: args.year,
    });
    return termId;
  },
});

export const update = mutation({
  args: {
    id: v.id("terms"),
    name: v.optional(v.string()),
    year: v.optional(v.number()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    isCurrent: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const term = await ctx.db.get(id);
    if (!term) throw new Error("Term not found");
    await requirePrincipal(ctx, term.schoolId);

    if (updates.isCurrent === true) {
      const currentTerm = await ctx.db
        .query("terms")
        .withIndex("by_current", (q) => q.eq("schoolId", term.schoolId).eq("isCurrent", true))
        .first();
      if (currentTerm && currentTerm._id !== id) {
        await ctx.db.patch(currentTerm._id, { isCurrent: false });
      }
    }

    await patchDefinedFields(ctx, "terms", id, updates);
    await logAuditEntry(ctx, term.schoolId, "term.update", { termId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("terms") },
  handler: async (ctx, { id }) => {
    const term = await ctx.db.get(id);
    if (!term) throw new Error("Term not found");
    await requirePrincipal(ctx, term.schoolId);

    const examsInTerm = await ctx.db
      .query("exams")
      .withIndex("by_termId", (q) => q.eq("termId", id))
      .take(1);
    if (examsInTerm.length > 0) {
      throw new Error("Cannot delete term: exams are linked to it. Remove exams first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, term.schoolId, "term.remove", { termId: id });
  },
});
