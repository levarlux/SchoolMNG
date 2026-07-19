import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requirePrincipal,
  requireSchoolMembership,
  logAuditEntry,
} from "./helpers";

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("exams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200);
  },
});

export const listByTerm = query({
  args: { termId: v.id("terms") },
  handler: async (ctx, { termId }) => {
    const term = await ctx.db.get(termId);
    if (!term) throw new Error("Term not found");
    await requireSchoolMembership(ctx, term.schoolId);
    return await ctx.db
      .query("exams")
      .withIndex("by_termId", (q) => q.eq("termId", termId))
      .take(100);
  },
});

export const get = query({
  args: { id: v.id("exams") },
  handler: async (ctx, { id }) => {
    const exam = await ctx.db.get(id);
    if (!exam) throw new Error("Exam not found");
    await requireSchoolMembership(ctx, exam.schoolId);
    return exam;
  },
});

export const getResults = query({
  args: { examId: v.id("exams") },
  handler: async (ctx, { examId }) => {
    const exam = await ctx.db.get(examId);
    if (!exam) throw new Error("Exam not found");
    await requireSchoolMembership(ctx, exam.schoolId);
    return await ctx.db
      .query("exam_results")
      .withIndex("by_examId", (q) => q.eq("examId", examId))
      .take(2000);
  },
});

export const getResultsByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    const student = await ctx.db.get(studentId);
    if (!student) throw new Error("Student not found");
    await requireSchoolMembership(ctx, student.schoolId);
    return await ctx.db
      .query("exam_results")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .take(500);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    termId: v.id("terms"),
    name: v.string(),
    date: v.float64(),
    examType: v.union(
      v.literal("mid_term"),
      v.literal("end_term"),
      v.literal("cat"),
      v.literal("assignment"),
      v.literal("other"),
    ),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const examId = await ctx.db.insert("exams", args);
    await logAuditEntry(ctx, args.schoolId, "exam.create", {
      examId,
      name: args.name,
      examType: args.examType,
    });
    return examId;
  },
});

export const update = mutation({
  args: {
    id: v.id("exams"),
    name: v.optional(v.string()),
    date: v.optional(v.float64()),
    examType: v.optional(
      v.union(
        v.literal("mid_term"),
        v.literal("end_term"),
        v.literal("cat"),
        v.literal("assignment"),
        v.literal("other"),
      )
    ),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { id, ...updates }) => {
    const exam = await ctx.db.get(id);
    if (!exam) throw new Error("Exam not found");
    await requirePrincipal(ctx, exam.schoolId);
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
    await logAuditEntry(ctx, exam.schoolId, "exam.update", { examId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("exams") },
  handler: async (ctx, { id }) => {
    const exam = await ctx.db.get(id);
    if (!exam) throw new Error("Exam not found");
    await requirePrincipal(ctx, exam.schoolId);

    const results = await ctx.db
      .query("exam_results")
      .withIndex("by_examId", (q) => q.eq("examId", id))
      .take(1);
    if (results.length > 0) {
      throw new Error("Cannot delete exam: results exist. Remove results first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, exam.schoolId, "exam.remove", { examId: id });
  },
});

export const enterResults = mutation({
  args: {
    schoolId: v.id("schools"),
    examId: v.id("exams"),
    results: v.array(v.object({
      studentId: v.id("students"),
      subjectId: v.id("subjects"),
      marks: v.number(),
      grade: v.optional(v.string()),
      comment: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    for (const r of args.results) {
      const existing = await ctx.db
        .query("exam_results")
        .withIndex("by_examId_and_subjectId", (q) =>
          q.eq("examId", args.examId).eq("subjectId", r.subjectId)
        )
        .filter((q) => q.eq(q.field("studentId"), r.studentId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          marks: r.marks,
          grade: r.grade,
          comment: r.comment,
        });
      } else {
        await ctx.db.insert("exam_results", {
          schoolId: args.schoolId,
          examId: args.examId,
          studentId: r.studentId,
          subjectId: r.subjectId,
          marks: r.marks,
          grade: r.grade,
          comment: r.comment,
        });
      }
    }

    await logAuditEntry(ctx, args.schoolId, "exam.enterResults", {
      examId: args.examId,
      count: args.results.length,
    });
  },
});

export const removeResult = mutation({
  args: { id: v.id("exam_results") },
  handler: async (ctx, { id }) => {
    const result = await ctx.db.get(id);
    if (!result) throw new Error("Result not found");
    await requirePrincipal(ctx, result.schoolId);
    await ctx.db.delete(id);
    await logAuditEntry(ctx, result.schoolId, "exam.removeResult", { resultId: id });
  },
});
