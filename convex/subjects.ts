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
      .query("subjects")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const listByLevel = query({
  args: { schoolId: v.id("schools"), level: v.string() },
  handler: async (ctx, { schoolId, level }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("subjects")
      .withIndex("by_level", (q) => q.eq("schoolId", schoolId).eq("level", level as any))
      .take(200);
  },
});

export const get = query({
  args: { id: v.id("subjects") },
  handler: async (ctx, { id }) => {
    const subject = await ctx.db.get(id);
    if (!subject) throw new Error("Subject not found");
    await requireSchoolMembership(ctx, subject.schoolId);
    return subject;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    code: v.string(),
    level: v.union(
      v.literal("pre_primary"),
      v.literal("lower_primary"),
      v.literal("upper_primary"),
      v.literal("junior_secondary"),
      v.literal("senior_secondary"),
      v.literal("general"),
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const subjectId = await ctx.db.insert("subjects", args);
    await logAuditEntry(ctx, args.schoolId, "subject.create", {
      subjectId,
      name: args.name,
      code: args.code,
    });
    return subjectId;
  },
});

export const update = mutation({
  args: {
    id: v.id("subjects"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    level: v.optional(
      v.union(
        v.literal("pre_primary"),
        v.literal("lower_primary"),
        v.literal("upper_primary"),
        v.literal("junior_secondary"),
        v.literal("senior_secondary"),
        v.literal("general"),
      )
    ),
  },
  handler: async (ctx, { id, ...updates }) => {
    const subject = await ctx.db.get(id);
    if (!subject) throw new Error("Subject not found");
    await requireSchoolMembership(ctx, subject.schoolId);
    await patchDefinedFields(ctx, "subjects", id, updates);
    await logAuditEntry(ctx, subject.schoolId, "subject.update", { subjectId: id, ...updates });
  },
});

export const remove = mutation({
  args: { id: v.id("subjects") },
  handler: async (ctx, { id }) => {
    const subject = await ctx.db.get(id);
    if (!subject) throw new Error("Subject not found");
    await requireSchoolMembership(ctx, subject.schoolId);

    const linkedTeachers = await ctx.db
      .query("teacher_subjects")
      .withIndex("by_subjectId", (q) => q.eq("subjectId", id))
      .take(1);
    if (linkedTeachers.length > 0) {
      throw new Error("Cannot delete subject: it is assigned to teachers. Remove assignments first.");
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, subject.schoolId, "subject.remove", { subjectId: id });
  },
});
