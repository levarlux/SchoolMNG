import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Internal queries for template rendering.
 * Separated from templateRenderer.ts because that file has "use node"
 * which restricts it to actions only.
 */

export const getSchoolInfo = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db.get(schoolId);
  },
});

export const getStudentInfo = internalQuery({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    return await ctx.db.get(studentId);
  },
});

export const getClassInfo = internalQuery({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    return await ctx.db.get(classId);
  },
});

export const getRecordForStudent = internalQuery({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    return await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();
  },
});

export const getFieldValuesForRecord = internalQuery({
  args: { recordId: v.id("records") },
  handler: async (ctx, { recordId }) => {
    return await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
      .take(200);
  },
});
