import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { seedFullTreeData } from "./seedFullTree";
import { logAuditEntry } from "./helpers";

/**
 * Backfill: create EAV records from existing students.
 * Run once after deploying the EAV schema.
 */
export const backfillStudents = internalMutation({
  args: {},
  handler: async (ctx) => {
    let processed = 0;
    let skipped = 0;

    for await (const student of ctx.db.query("students")) {
      // Check if a record already exists for this student
      const existing = await ctx.db
        .query("records")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", student.schoolId))
        .filter((q) => q.eq(q.field("displayName"), `${student.firstName} ${student.lastName}`))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      // Create the record
      const recordId = await ctx.db.insert("records", {
        schoolId: student.schoolId,
        bucket: "learner",
        displayName: `${student.firstName} ${student.lastName}`,
        photoUrl: student.photoUrl ?? undefined,
        status: student.status ?? "active",
      });

      processed++;
    }

    return { processed, skipped };
  },
});

/**
 * Backfill: create EAV records from existing teachers.
 */
export const backfillTeachers = internalMutation({
  args: {},
  handler: async (ctx) => {
    let processed = 0;
    let skipped = 0;

    for await (const teacher of ctx.db.query("teachers")) {
      const existing = await ctx.db
        .query("records")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", teacher.schoolId))
        .filter((q) => q.eq(q.field("displayName"), `${teacher.firstName} ${teacher.lastName}`))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      const recordId = await ctx.db.insert("records", {
        schoolId: teacher.schoolId,
        bucket: "teaching_staff",
        displayName: `${teacher.firstName} ${teacher.lastName}`,
        photoUrl: undefined,
        status: "active",
      });

      processed++;
    }

    return { processed, skipped };
  },
});

/**
 * Seed default modules for a school.
 * Deprecated in 17A.2 — the full tree lives in convex/seedFullTree.ts.
 * Keeps the public name so existing call sites keep working.
 */
export const seedDefaultModules = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await seedFullTreeData(ctx, args.schoolId);
    return { ok: true };
  },
});
