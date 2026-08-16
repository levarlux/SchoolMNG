import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import {
  requireSchoolMembership,
  requireModuleEditAccessByName,
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
      .order("desc")
      .take(100);
  },
});

/**
 * List the direct children of a recursive term/period node
 * (Year → Semester → Term → Week → Day, any depth).
 */
export const listChildren = query({
  args: { parentId: v.id("terms") },
  handler: async (ctx, { parentId }) => {
    const parent = await ctx.db.get(parentId);
    if (!parent) throw new Error("Term not found");
    await requireSchoolMembership(ctx, parent.schoolId);
    return await ctx.db
      .query("terms")
      .withIndex("by_parentId", (q) => q.eq("parentId", parentId))
      .order("asc")
      .take(100);
  },
});

/**
 * Get the currently active term for a school.
 * Returns the term with status "active".
 */
export const getCurrent = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    // Try new status-based lookup first
    const byStatus = await ctx.db
      .query("terms")
      .withIndex("by_status", (q) =>
        q.eq("schoolId", schoolId).eq("status", "active")
      )
      .first();
    if (byStatus) return byStatus;
    // Fallback: legacy isCurrent flag
    return await ctx.db
      .query("terms")
      .withIndex("by_current", (q) =>
        q.eq("schoolId", schoolId).eq("isCurrent", true)
      )
      .first();
  },
});

export const listByAcademicYear = query({
  args: { academicYearId: v.id("academicYears") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("terms")
      .withIndex("by_academicYearId", (q) =>
        q.eq("academicYearId", args.academicYearId)
      )
      .order("asc")
      .take(50);
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
    academicYearId: v.id("academicYears"),
    // Recursive period: Year → Semester → Term → Week → Day (any depth).
    // Omit for a top-level term.
    parentId: v.optional(v.id("terms")),
    name: v.string(),
    year: v.number(),
    startDate: v.float64(),
    endDate: v.float64(),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");

    // Parent, if given, must belong to the same school and same academic year.
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.schoolId !== args.schoolId) {
        throw new Error("Parent term does not belong to this school");
      }
    }

    // Default status is "upcoming" — activate via activateTerm or rollover
    const termId = await ctx.db.insert("terms", {
      schoolId: args.schoolId,
      academicYearId: args.academicYearId,
      parentId: args.parentId ?? undefined,
      name: args.name,
      year: args.year,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "upcoming",
    });
    await logAuditEntry(ctx, args.schoolId, "term.create", {
      termId,
      name: args.name,
      year: args.year,
      parentId: args.parentId ?? null,
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
    status: v.optional(
      v.union(v.literal("upcoming"), v.literal("active"), v.literal("closed"))
    ),
    parentId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { id, ...updates }) => {
    const term = await ctx.db.get(id);
    if (!term) throw new Error("Term not found");
    await requireModuleEditAccessByName(ctx, term.schoolId, "Academics");

    // If setting to active, deactivate any currently active term in the same year
    if (updates.status === "active") {
      const currentActive = await ctx.db
        .query("terms")
        .withIndex("by_status", (q) =>
          q.eq("schoolId", term.schoolId).eq("status", "active")
        )
        .first();
      if (currentActive && currentActive._id !== id) {
        await ctx.db.patch(currentActive._id, { status: "closed" });
      }
    }

    // Re-parenting: forbid cycles (a node cannot be its own ancestor).
    if (updates.parentId !== undefined) {
      if (updates.parentId === id) {
        throw new Error("A term cannot be its own parent");
      }
      let checkId: Id<"terms"> | null = updates.parentId;
      let hops = 0;
      while (checkId && hops < 20) {
        if (checkId === id) throw new Error("Cannot reparent a term into its own subtree");
        const ancestor: Doc<"terms"> | null = await ctx.db.get(checkId);
        checkId = ancestor?.parentId ?? null;
        hops++;
      }
    }

    await patchDefinedFields(ctx, "terms", id, updates);
    await logAuditEntry(ctx, term.schoolId, "term.update", {
      termId: id,
      ...updates,
    });
  },
});

/**
 * Activate a specific term — closes the currently active term and activates this one.
 */
export const activate = mutation({
  args: { id: v.id("terms") },
  handler: async (ctx, args) => {
    const term = await ctx.db.get(args.id);
    if (!term) throw new Error("Term not found");
    await requireModuleEditAccessByName(ctx, term.schoolId, "Academics");

    // Close the currently active term
    const currentActive = await ctx.db
      .query("terms")
      .withIndex("by_status", (q) =>
        q.eq("schoolId", term.schoolId).eq("status", "active")
      )
      .first();
    if (currentActive && currentActive._id !== args.id) {
      await ctx.db.patch(currentActive._id, { status: "closed" });
    }

    await ctx.db.patch(args.id, { status: "active" });
    await logAuditEntry(ctx, term.schoolId, "term.activate", {
      termId: args.id,
    });
  },
});

/**
 * Close a term — sets status to "closed".
 */
export const close = mutation({
  args: { id: v.id("terms") },
  handler: async (ctx, args) => {
    const term = await ctx.db.get(args.id);
    if (!term) throw new Error("Term not found");
    await requireModuleEditAccessByName(ctx, term.schoolId, "Academics");
    await ctx.db.patch(args.id, { status: "closed" });
    await logAuditEntry(ctx, term.schoolId, "term.close", {
      termId: args.id,
    });
  },
});

/**
 * Rollover: close the current active term and activate the next upcoming term
 * in the same academic year. If no upcoming term exists, creates a new one
 * based on the pattern of the closed term.
 */
export const rollover = mutation({
  args: {
    schoolId: v.id("schools"),
    /** If provided, activates this specific term. Otherwise, auto-selects the next upcoming. */
    nextTermId: v.optional(v.id("terms")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");

    // Find the currently active term
    const currentActive = await ctx.db
      .query("terms")
      .withIndex("by_status", (q) =>
        q.eq("schoolId", args.schoolId).eq("status", "active")
      )
      .first();

    if (currentActive) {
      // Close the current term
      await ctx.db.patch(currentActive._id, { status: "closed" });
    }

    let nextTerm;
    if (args.nextTermId) {
      nextTerm = await ctx.db.get(args.nextTermId);
      if (!nextTerm || nextTerm.schoolId !== args.schoolId) {
        throw new Error("Invalid next term");
      }
    } else {
      // Find the next upcoming term in the same academic year
      if (currentActive) {
        nextTerm = await ctx.db
          .query("terms")
          .withIndex("by_academicYearId", (q) =>
            q.eq("academicYearId", currentActive.academicYearId)
          )
          .order("asc")
          .filter((q) => q.eq(q.field("status"), "upcoming"))
          .first();
      }
    }

    if (nextTerm) {
      await ctx.db.patch(nextTerm._id, { status: "active" });
    }

    await logAuditEntry(ctx, args.schoolId, "term.rollover", {
      closedTermId: currentActive?._id,
      activatedTermId: nextTerm?._id,
    });

    return {
      closed: currentActive?._id ?? null,
      activated: nextTerm?._id ?? null,
    };
  },
});

export const remove = mutation({
  args: { id: v.id("terms") },
  handler: async (ctx, { id }) => {
    const term = await ctx.db.get(id);
    if (!term) throw new Error("Term not found");
    await requireModuleEditAccessByName(ctx, term.schoolId, "Academics");

    // Cannot delete an active term
    if (term.status === "active") {
      throw new Error("Cannot delete an active term. Close or rollover first.");
    }

    const examsInTerm = await ctx.db
      .query("exams")
      .withIndex("by_termId", (q) => q.eq("termId", id))
      .take(1);
    if (examsInTerm.length > 0) {
      throw new Error("Cannot delete term: exams are linked to it. Remove exams first.");
    }

    // Recursive terms: a node with children cannot be deleted directly.
    const children = await ctx.db
      .query("terms")
      .withIndex("by_parentId", (q) => q.eq("parentId", id))
      .take(1);
    if (children.length > 0) {
      throw new Error("Cannot delete term: it has nested terms. Remove the child terms first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, term.schoolId, "term.remove", { termId: id });
  },
});
