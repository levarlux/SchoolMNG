import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Promotion/Progression");
    return await ctx.db
      .query("promotion_history")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools"), termId: v.optional(v.id("terms")) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.termId) {
      return await ctx.db
        .query("promotion_history")
        .withIndex("by_termId", (q) => q.eq("termId", args.termId!))
        .order("desc")
        .take(500);
    }
    return await ctx.db
      .query("promotion_history")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

export const promote = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    fromClassId: v.id("classes"),
    toClassId: v.id("classes"),
    fromStreamId: v.optional(v.id("streams")),
    toStreamId: v.optional(v.id("streams")),
    termId: v.id("terms"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Promotion/Progression");
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("promotion_history", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      fromClassId: args.fromClassId,
      toClassId: args.toClassId,
      fromStreamId: args.fromStreamId,
      toStreamId: args.toStreamId,
      termId: args.termId,
      reason: args.reason,
      promotedBy: identity?.subject ?? "system",
      promotedAt: Date.now(),
    });
    // Also update the student's current class
    await ctx.db.patch(args.studentId, {
      classId: args.toClassId,
      streamId: args.toStreamId,
    });
    await logAuditEntry(ctx, args.schoolId, "promotion.promote", {
      promotionId: id,
      studentId: args.studentId,
      fromClassId: args.fromClassId,
      toClassId: args.toClassId,
    });
    return id;
  },
});

export const bulkPromote = mutation({
  args: {
    schoolId: v.id("schools"),
    termId: v.id("terms"),
    promotions: v.array(
      v.object({
        studentId: v.id("students"),
        fromClassId: v.id("classes"),
        toClassId: v.id("classes"),
        fromStreamId: v.optional(v.id("streams")),
        toStreamId: v.optional(v.id("streams")),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Promotion/Progression");
    const identity = await ctx.auth.getUserIdentity();
    let promoted = 0;
    for (const p of args.promotions) {
      await ctx.db.insert("promotion_history", {
        schoolId: args.schoolId,
        studentId: p.studentId,
        fromClassId: p.fromClassId,
        toClassId: p.toClassId,
        fromStreamId: p.fromStreamId,
        toStreamId: p.toStreamId,
        termId: args.termId,
        promotedBy: identity?.subject ?? "system",
        promotedAt: Date.now(),
      });
      await ctx.db.patch(p.studentId, {
        classId: p.toClassId,
        streamId: p.toStreamId,
      });
      promoted++;
    }
    await logAuditEntry(ctx, args.schoolId, "promotion.bulkPromote", {
      termId: args.termId,
      promoted,
    });
    return { promoted };
  },
});

export const remove = mutation({
  args: { id: v.id("promotion_history") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Promotion record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Promotion/Progression");
    await ctx.db.delete(args.id);
  },
});
