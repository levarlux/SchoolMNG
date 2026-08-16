import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireModuleEditAccessByName,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";
import { nextStaffNumberInternal } from "./blueprints";
import { Id } from "./_generated/dataModel";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("teachers")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const get = query({
  args: { id: v.id("teachers") },
  handler: async (ctx, { id }) => {
    const teacher = await ctx.db.get(id);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);
    return teacher;
  },
});

export const listSubjectsByTeacher = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, { teacherId }) => {
    const teacher = await ctx.db.get(teacherId);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);
    return await ctx.db
      .query("teacher_subjects")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .take(100);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    // Optional: when blank, the school's blueprint convention generates it.
    staffNo: v.optional(v.string()),
    department: v.optional(v.string()),
    category: v.optional(v.union(v.literal("teaching"), v.literal("non_teaching"))),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Staff Record");

    // Auto-generate the staff number when the caller left it blank, using the
    // school's blueprint convention (falls back to legacy scheme).
    const staffNo = args.staffNo?.trim() || (await nextStaffNumberInternal(ctx, args.schoolId));

    const existing = await ctx.db
      .query("teachers")
      .withIndex("by_staffNo", (q) => q.eq("schoolId", args.schoolId).eq("staffNo", staffNo))
      .first();
    if (existing) {
      throw new Error("A teacher with this staff number already exists");
    }

    const teacherId = await ctx.db.insert("teachers", { ...args, staffNo });
    await logAuditEntry(ctx, args.schoolId, "teacher.create", {
      teacherId,
      firstName: args.firstName,
      lastName: args.lastName,
      staffNo: args.staffNo,
    });
    return teacherId;
  },
});

export const update = mutation({
  args: {
    id: v.id("teachers"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    staffNo: v.optional(v.string()),
    department: v.optional(v.string()),
    category: v.optional(v.union(v.literal("teaching"), v.literal("non_teaching"))),
  },
  handler: async (ctx, { id, ...updates }) => {
    const teacher = await ctx.db.get(id);
    if (!teacher) throw new Error("Teacher not found");
    await requireModuleEditAccessByName(ctx, teacher.schoolId, "Staff Record");

    if (updates.staffNo !== undefined) {
      const existing = await ctx.db
        .query("teachers")
        .withIndex("by_staffNo", (q) => q.eq("schoolId", teacher.schoolId).eq("staffNo", updates.staffNo!))
        .first();
      if (existing && existing._id !== id) {
        throw new Error("A teacher with this staff number already exists");
      }
    }

    await patchDefinedFields(ctx, "teachers", id, updates);
    await logAuditEntry(ctx, teacher.schoolId, "teacher.update", { teacherId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("teachers") },
  handler: async (ctx, { id }) => {
    const teacher = await ctx.db.get(id);
    if (!teacher) throw new Error("Teacher not found");
    await requireModuleEditAccessByName(ctx, teacher.schoolId, "Staff Record");

    const assignments = await ctx.db
      .query("teacher_subjects")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", id))
      .take(1);
    if (assignments.length > 0) {
      throw new Error("Cannot delete teacher: subject assignments exist. Remove them first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, teacher.schoolId, "teacher.remove", {
      teacherId: id,
      staffNo: teacher.staffNo,
    });
  },
});

export const assignSubject = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    classId: v.optional(v.id("classes")),
    streamId: v.optional(v.id("streams")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Staff Record");

    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher) throw new Error("Teacher not found");

    if (args.classId) {
      const cls = await ctx.db.get(args.classId);
      if (!cls) throw new Error("Class not found");
      if (cls.schoolId !== args.schoolId) throw new Error("Class does not belong to this school");
    }

    const existing = await ctx.db
      .query("teacher_subjects")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .filter((q) =>
        q.and(
          q.eq(q.field("subjectId"), args.subjectId),
          args.classId
            ? q.eq(q.field("classId"), args.classId)
            : q.eq(q.field("classId"), undefined)
        )
      )
      .first();
    if (existing) {
      throw new Error("This assignment already exists");
    }

    const assignmentId = await ctx.db.insert("teacher_subjects", {
      schoolId: args.schoolId,
      teacherId: args.teacherId,
      subjectId: args.subjectId,
      classId: args.classId,
      streamId: args.streamId,
    });
    await logAuditEntry(ctx, args.schoolId, "teacher.assignSubject", {
      assignmentId,
      teacherId: args.teacherId,
      subjectId: args.subjectId,
      classId: args.classId,
    });
    return assignmentId;
  },
});

export const removeSubjectAssignment = mutation({
  args: { id: v.id("teacher_subjects") },
  handler: async (ctx, { id }) => {
    const assignment = await ctx.db.get(id);
    if (!assignment) throw new Error("Assignment not found");
    await requireModuleEditAccessByName(ctx, assignment.schoolId, "Staff Record");
    await ctx.db.delete(id);
    await logAuditEntry(ctx, assignment.schoolId, "teacher.removeSubjectAssignment", {
      assignmentId: id,
    });
  },
});

// ── Teacher relationships on the generic link layer (spec §1.4) ────
// Teacher↔Learner (mentor/counselor, independent of any subject/class) and
// Teacher↔Class (a "class teacher"-style assignment, independent of Subject)
// are stored as `entity_links` rows — no new fixed table. These helpers give
// the relationships UI typed access; the underlying rows are managed through
// the generic idempotent `entityLinks.create` / `remove`.

const TEACHER_LINK_TYPES = {
  learner: "teacher_student",
  class: "teacher_class",
} as const;

/** All active learner links for a teacher, resolved with student display names. */
export const listLinkedLearners = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, { teacherId }) => {
    const teacher = await ctx.db.get(teacherId);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);

    const [fromLinks, toLinks] = await Promise.all([
      ctx.db
        .query("entity_links")
        .withIndex("by_fromTable_fromId_linkType", (q) =>
          q
            .eq("fromTable", "teachers")
            .eq("fromId", teacherId)
            .eq("linkType", TEACHER_LINK_TYPES.learner)
        )
        .take(200),
      ctx.db
        .query("entity_links")
        .withIndex("by_toTable_toId_linkType", (q) =>
          q
            .eq("toTable", "teachers")
            .eq("toId", teacherId)
            .eq("linkType", TEACHER_LINK_TYPES.learner)
        )
        .take(200),
    ]);

    const links = [...fromLinks, ...toLinks].filter((l) => l.isActive);
    const students = await Promise.all(
      links.map(async (l) => {
        const studentId =
          l.fromTable === "students" ? l.fromId : l.toTable === "students" ? l.toId : null;
        if (!studentId) return null;
        const student = await ctx.db.get(studentId as Id<"students">);
        if (!student || student.schoolId !== teacher.schoolId) return null;
        return {
          linkId: l._id,
          studentId: student._id,
          name: `${student.firstName} ${student.lastName}`.trim(),
          admNo: student.admNo,
          role: l.role,
          startDate: l.startDate,
          endDate: l.endDate,
        };
      })
    );
    return students.filter((s) => s !== null);
  },
});

/** All active class links for a teacher, resolved with class names. */
export const listLinkedClasses = query({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, { teacherId }) => {
    const teacher = await ctx.db.get(teacherId);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);

    const [fromLinks, toLinks] = await Promise.all([
      ctx.db
        .query("entity_links")
        .withIndex("by_fromTable_fromId_linkType", (q) =>
          q
            .eq("fromTable", "teachers")
            .eq("fromId", teacherId)
            .eq("linkType", TEACHER_LINK_TYPES.class)
        )
        .take(200),
      ctx.db
        .query("entity_links")
        .withIndex("by_toTable_toId_linkType", (q) =>
          q
            .eq("toTable", "teachers")
            .eq("toId", teacherId)
            .eq("linkType", TEACHER_LINK_TYPES.class)
        )
        .take(200),
    ]);

    const links = [...fromLinks, ...toLinks].filter((l) => l.isActive);
    const classes = await Promise.all(
      links.map(async (l) => {
        const classId =
          l.fromTable === "classes" ? l.fromId : l.toTable === "classes" ? l.toId : null;
        if (!classId) return null;
        const cls = await ctx.db.get(classId as Id<"classes">);
        if (!cls || cls.schoolId !== teacher.schoolId) return null;
        return {
          linkId: l._id,
          classId: cls._id,
          name: cls.name,
          role: l.role,
          startDate: l.startDate,
          endDate: l.endDate,
        };
      })
    );
    return classes.filter((c) => c !== null);
  },
});

/** Link a teacher to a learner (mentor/counselor). Idempotent via entityLinks. */
export const linkLearner = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    studentId: v.id("students"),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Staff Record");
    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher) throw new Error("Teacher not found");
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    if (teacher.schoolId !== args.schoolId || student.schoolId !== args.schoolId) {
      throw new Error("Teacher and student must belong to this school");
    }
    const existing = await ctx.db
      .query("entity_links")
      .withIndex("by_fromTable_fromId_linkType", (q) =>
        q
          .eq("fromTable", "teachers")
          .eq("fromId", args.teacherId)
          .eq("linkType", TEACHER_LINK_TYPES.learner)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("toTable"), "students"),
          q.eq(q.field("toId"), args.studentId),
          q.eq(q.field("isActive"), true)
        )
      )
      .first();
    if (existing) return existing._id;

    const linkId = await ctx.db.insert("entity_links", {
      schoolId: args.schoolId,
      linkType: TEACHER_LINK_TYPES.learner,
      fromTable: "teachers",
      fromId: args.teacherId,
      toTable: "students",
      toId: args.studentId,
      isActive: true,
    });
    await logAuditEntry(ctx, args.schoolId, "teacher.linkLearner", {
      linkId,
      teacherId: args.teacherId,
      studentId: args.studentId,
    });
    return linkId;
  },
});

/** Link a teacher to a class (class-teacher assignment, independent of Subject). */
export const linkClass = mutation({
  args: {
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    classId: v.id("classes"),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Staff Record");
    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher) throw new Error("Teacher not found");
    const cls = await ctx.db.get(args.classId);
    if (!cls) throw new Error("Class not found");
    if (teacher.schoolId !== args.schoolId || cls.schoolId !== args.schoolId) {
      throw new Error("Teacher and class must belong to this school");
    }
    const existing = await ctx.db
      .query("entity_links")
      .withIndex("by_fromTable_fromId_linkType", (q) =>
        q
          .eq("fromTable", "teachers")
          .eq("fromId", args.teacherId)
          .eq("linkType", TEACHER_LINK_TYPES.class)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("toTable"), "classes"),
          q.eq(q.field("toId"), args.classId),
          q.eq(q.field("isActive"), true)
        )
      )
      .first();
    if (existing) return existing._id;

    const linkId = await ctx.db.insert("entity_links", {
      schoolId: args.schoolId,
      linkType: TEACHER_LINK_TYPES.class,
      fromTable: "teachers",
      fromId: args.teacherId,
      toTable: "classes",
      toId: args.classId,
      isActive: true,
    });
    await logAuditEntry(ctx, args.schoolId, "teacher.linkClass", {
      linkId,
      teacherId: args.teacherId,
      classId: args.classId,
    });
    return linkId;
  },
});

/** Remove a teacher relationship link (mentor/learner or class-teacher). */
export const unlink = mutation({
  args: { id: v.id("entity_links") },
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new Error("Link not found");
    if (link.fromTable !== "teachers") throw new Error("Not a teacher relationship link");
    if (link.linkType !== TEACHER_LINK_TYPES.learner && link.linkType !== TEACHER_LINK_TYPES.class) {
      throw new Error("Not a teacher relationship link");
    }
    const teacher = await ctx.db.get(link.fromId as Id<"teachers">);
    if (!teacher) throw new Error("Teacher not found");
    await requireModuleEditAccessByName(ctx, teacher.schoolId, "Staff Record");
    await ctx.db.patch(id, { isActive: false });
    await logAuditEntry(ctx, teacher.schoolId, "teacher.unlink", {
      linkId: id,
      linkType: link.linkType,
    });
  },
});
