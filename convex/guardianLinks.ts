import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireStudentMembership, logAuditEntry } from "./helpers";

/** List links by guardian */
export const listByGuardian = query({
  args: { guardianId: v.id("guardians") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guardian_links")
      .withIndex("by_guardianId", (q) => q.eq("guardianId", args.guardianId))
      .take(100);
  },
});

/** List links by student */
export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    const links = await ctx.db
      .query("guardian_links")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .take(20);

    const results: Array<{
      _id: string;
      firstName: string;
      lastName: string;
      phone: string;
      relationship: string;
      isPrimary: boolean;
      linkId: string;
    }> = [];
    for (const link of links) {
      const guardian = await ctx.db.get(link.guardianId);
      if (guardian) {
        results.push({
          _id: guardian._id,
          firstName: guardian.firstName,
          lastName: guardian.lastName,
          phone: guardian.phone,
          relationship: guardian.relationship,
          isPrimary: link.isPrimary,
          linkId: link._id,
        });
      }
    }
    return results;
  },
});

/** List all links for a school */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guardian_links")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
  },
});

/** Create a link between guardian and student */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    guardianId: v.id("guardians"),
    studentId: v.id("students"),
    isPrimary: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate
    const existing = await ctx.db
      .query("guardian_links")
      .withIndex("by_guardianId", (q) => q.eq("guardianId", args.guardianId))
      .filter((q) => q.eq(q.field("studentId"), args.studentId))
      .first();

    if (existing) {
      throw new Error("Guardian is already linked to this student");
    }

    // If this is primary, unset other primary links for this student
    if (args.isPrimary) {
      const existingLinks = await ctx.db
        .query("guardian_links")
        .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
        .take(20);
      for (const link of existingLinks) {
        if (link.isPrimary) {
          await ctx.db.patch(link._id, { isPrimary: false });
        }
      }
    }

    const id = await ctx.db.insert("guardian_links", args);
    await logAuditEntry(ctx, args.schoolId, "guardian_link.create", {
      guardianId: args.guardianId,
      studentId: args.studentId,
    });
    return id;
  },
});

/** Update link (e.g. change primary status) */
export const update = mutation({
  args: {
    id: v.id("guardian_links"),
    isPrimary: v.boolean(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.id);
    if (!link) throw new Error("Link not found");

    // If setting as primary, unset other primary links for this student
    if (args.isPrimary) {
      const existingLinks = await ctx.db
        .query("guardian_links")
        .withIndex("by_studentId", (q) => q.eq("studentId", link.studentId))
        .take(20);
      for (const otherLink of existingLinks) {
        if (otherLink._id !== args.id && otherLink.isPrimary) {
          await ctx.db.patch(otherLink._id, { isPrimary: false });
        }
      }
    }

    await ctx.db.patch(args.id, { isPrimary: args.isPrimary });
    await logAuditEntry(ctx, link.schoolId, "guardian_link.update", {
      guardianId: link.guardianId,
      studentId: link.studentId,
    });
  },
});

/** Remove a link */
export const remove = mutation({
  args: { id: v.id("guardian_links") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.id);
    if (!link) throw new Error("Link not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, link.schoolId, "guardian_link.remove", {
      guardianId: link.guardianId,
      studentId: link.studentId,
    });
  },
});
