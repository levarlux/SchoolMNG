import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

/**
 * List all class assignments for a term.
 */
export const listByTerm = query({
  args: { termId: v.id("terms") },
  handler: async (ctx, args) => {
    const term = await ctx.db.get(args.termId);
    if (!term) throw new Error("Term not found");
    await requireSchoolMembership(ctx, term.schoolId);
    return await ctx.db
      .query("classAssignments")
      .withIndex("by_termId", (q) => q.eq("termId", args.termId))
      .take(500);
  },
});

/**
 * List all class assignments for a student across terms.
 */
export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("classAssignments")
      .withIndex("by_studentId_termId", (q) =>
        q.eq("studentId", args.studentId)
      )
      .take(50);
  },
});

/**
 * Get a student's class assignment for a specific term.
 */
export const getForStudentTerm = query({
  args: {
    studentId: v.id("students"),
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("classAssignments")
      .withIndex("by_studentId_termId", (q) =>
        q.eq("studentId", args.studentId).eq("termId", args.termId)
      )
      .first();
  },
});

/**
 * List all students in a class for a specific term.
 */
export const listStudentsByClassTerm = query({
  args: {
    classId: v.id("classes"),
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("classAssignments")
      .withIndex("by_classId_termId", (q) =>
        q.eq("classId", args.classId).eq("termId", args.termId)
      )
      .take(500);
  },
});

/**
 * Create a class assignment for a student in a term.
 */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");

    // Check for duplicate assignment
    const existing = await ctx.db
      .query("classAssignments")
      .withIndex("by_studentId_termId", (q) =>
        q.eq("studentId", args.studentId).eq("termId", args.termId)
      )
      .first();
    if (existing) {
      throw new Error("Student already has a class assignment for this term");
    }

    const id = await ctx.db.insert("classAssignments", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      classId: args.classId,
      streamId: args.streamId,
      termId: args.termId,
    });
    await logAuditEntry(ctx, args.schoolId, "classAssignment.create", {
      assignmentId: id,
      studentId: args.studentId,
      classId: args.classId,
      termId: args.termId,
    });
    return id;
  },
});

/**
 * Bulk create class assignments for all students in a class.
 * Used during term setup or rollover.
 */
export const bulkCreate = mutation({
  args: {
    schoolId: v.id("schools"),
    termId: v.id("terms"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    studentIds: v.array(v.id("students")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");
    let created = 0;
    let skipped = 0;

    for (const studentId of args.studentIds) {
      const existing = await ctx.db
        .query("classAssignments")
        .withIndex("by_studentId_termId", (q) =>
          q.eq("studentId", studentId).eq("termId", args.termId)
        )
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("classAssignments", {
        schoolId: args.schoolId,
        studentId,
        classId: args.classId,
        streamId: args.streamId,
        termId: args.termId,
      });
      created++;
    }

    await logAuditEntry(ctx, args.schoolId, "classAssignment.bulkCreate", {
      termId: args.termId,
      classId: args.classId,
      created,
      skipped,
    });
    return { created, skipped };
  },
});

/**
 * Remove a class assignment.
 */
export const remove = mutation({
  args: { id: v.id("classAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.id);
    if (!assignment) throw new Error("Assignment not found");
    await requireModuleEditAccessByName(ctx, assignment.schoolId, "Academics");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, assignment.schoolId, "classAssignment.remove", {
      assignmentId: args.id,
    });
  },
});
