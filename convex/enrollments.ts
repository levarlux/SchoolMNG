import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireClassMembership,
  requireStudentMembership,
  requireModuleEditAccessByName,
  logAuditEntry,
} from "./helpers";

/**
 * Enrollments (P1#7): the anchor for Learner↔Term lifecycle.
 *
 * Each row answers "what was student X's class/stream/status in term Y?". The
 * status state machine (active → suspended/withdrawn/graduated) is enforced
 * here so the record is the single source of truth for per-term enrolment,
 * replacing the flat `students.status` blob (kept for back-compat).
 *
 * Created alongside `classAssignments` so the two stay consistent: a term
 * enrolment implies a class placement, and vice versa.
 */

const ENROLLMENT_STATUSES = v.union(
  v.literal("active"),
  v.literal("graduated"),
  v.literal("withdrawn"),
  v.literal("suspended"),
);

// Legal transitions; anything else is rejected.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ["active", "graduated", "withdrawn", "suspended"],
  suspended: ["active", "graduated", "withdrawn"],
  graduated: ["graduated"], // terminal
  withdrawn: ["withdrawn"], // terminal
};

// ── Read-only queries ───────────────────────────────────────────────

export const listByTerm = query({
  args: { termId: v.id("terms") },
  handler: async (ctx, args) => {
    const term = await ctx.db.get(args.termId);
    if (!term) throw new Error("Term not found");
    await requireSchoolMembership(ctx, term.schoolId);
    return await ctx.db
      .query("enrollments")
      .withIndex("by_termId", (q) => q.eq("termId", args.termId))
      .take(500);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("enrollments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(5000);
  },
});

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireStudentMembership(ctx, args.studentId);
    return await ctx.db
      .query("enrollments")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(200);
  },
});

export const getForStudentTerm = query({
  args: {
    studentId: v.id("students"),
    termId: v.id("terms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("enrollments")
      .withIndex("by_studentId_termId", (q) =>
        q.eq("studentId", args.studentId).eq("termId", args.termId)
      )
      .first();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Enroll a student in a term: insert a row or move an existing row
 * (class/stream may change when a student is promoted mid-term).
 * Status is forced to "active" on (re)enrolment — a continuing student's
 * row is just reactivated.
 */
export const enroll = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    termId: v.id("terms"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Academics");
    await requireClassMembership(ctx, args.classId);

    const term = await ctx.db.get(args.termId);
    if (!term || term.schoolId !== args.schoolId) {
      throw new Error("Term does not belong to this school");
    }

    const existing = await ctx.db
      .query("enrollments")
      .withIndex("by_studentId_termId", (q) =>
        q.eq("studentId", args.studentId).eq("termId", args.termId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        classId: args.classId,
        streamId: args.streamId ?? existing.streamId,
        status: "active",
        updatedAt: now,
        ...(args.notes !== undefined ? { notes: args.notes } : {}),
      });
      await logAuditEntry(ctx, args.schoolId, "enrollment.update", {
        enrollmentId: existing._id,
        studentId: args.studentId,
        termId: args.termId,
        classId: args.classId,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("enrollments", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      termId: args.termId,
      classId: args.classId,
      streamId: args.streamId,
      status: "active",
      enrolledAt: now,
      updatedAt: now,
      notes: args.notes,
    });
    await logAuditEntry(ctx, args.schoolId, "enrollment.create", {
      enrollmentId: id,
      studentId: args.studentId,
      termId: args.termId,
      classId: args.classId,
    });
    return id;
  },
});

/**
 * Advance the enrolment state machine. Terminal statuses (graduated /
 * withdrawn) cannot be reopened; a suspended student can be reactivated.
 */
export const updateStatus = mutation({
  args: {
    id: v.id("enrollments"),
    status: ENROLLMENT_STATUSES,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.id);
    if (!enrollment) throw new Error("Enrollment not found");
    await requireModuleEditAccessByName(ctx, enrollment.schoolId, "Academics");

    const allowed = STATUS_TRANSITIONS[enrollment.status] ?? [];
    if (!allowed.includes(args.status)) {
      throw new Error(
        `Cannot change status from "${enrollment.status}" to "${args.status}"`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: now,
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
    });
    await logAuditEntry(ctx, enrollment.schoolId, "enrollment.updateStatus", {
      enrollmentId: args.id,
      from: enrollment.status,
      to: args.status,
    });
  },
});

/**
 * Remove an enrolment row (undo). Prefer `updateStatus(graduated/withdrawn)`
 * over hard deletion so history survives.
 */
export const remove = mutation({
  args: { id: v.id("enrollments") },
  handler: async (ctx, args) => {
    const enrollment = await ctx.db.get(args.id);
    if (!enrollment) throw new Error("Enrollment not found");
    await requireModuleEditAccessByName(ctx, enrollment.schoolId, "Academics");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, enrollment.schoolId, "enrollment.remove", {
      enrollmentId: args.id,
      studentId: enrollment.studentId,
      termId: enrollment.termId,
    });
  },
});