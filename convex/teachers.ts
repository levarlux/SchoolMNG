import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireSchoolMembership,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";

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
    staffNo: v.string(),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    const existing = await ctx.db
      .query("teachers")
      .withIndex("by_staffNo", (q) => q.eq("schoolId", args.schoolId).eq("staffNo", args.staffNo))
      .first();
    if (existing) {
      throw new Error("A teacher with this staff number already exists");
    }

    const teacherId = await ctx.db.insert("teachers", args);
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
  },
  handler: async (ctx, { id, ...updates }) => {
    const teacher = await ctx.db.get(id);
    if (!teacher) throw new Error("Teacher not found");
    await requireSchoolMembership(ctx, teacher.schoolId);

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
    await requireSchoolMembership(ctx, teacher.schoolId);

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
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher) throw new Error("Teacher not found");

    const existing = await ctx.db
      .query("teacher_subjects")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", args.teacherId))
      .filter((q) =>
        q.eq(q.field("subjectId"), args.subjectId) &&
        q.eq(q.field("classId"), args.classId)
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
    await requireSchoolMembership(ctx, assignment.schoolId);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, assignment.schoolId, "teacher.removeSubjectAssignment", {
      assignmentId: id,
    });
  },
});
