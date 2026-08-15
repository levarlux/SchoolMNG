import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { requirePrincipal } from "./helpers";
import { normalizeName } from "./classResolver";

/**
 * Remove junk left behind by a bad import (or a pre-resolver version of one):
 * a phantom class created verbatim from a combined value like "Grade 1 A",
 * its fee structures and streams, and optionally the empty auto-created terms
 * it produced.
 *
 * Safety gates:
 *  - A class that still has students is NEVER removed (skipped + reported).
 *  - A term is only removed when nothing references it: no fee structures, no
 *    fee payments, no exams, no class assignments.
 *
 * Run through a dashboard/dev tool, not from user-facing UI.
 */
export const cleanupPhantomImportData = internalMutation({
  args: {
    schoolId: v.id("schools"),
    className: v.string(),
    deleteEmptyTerms: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const norm = normalizeName(args.className);

    const report = {
      classesRemoved: 0,
      classesSkipped: [] as string[],
      structuresRemoved: 0,
      streamsRemoved: 0,
      termsRemoved: 0,
      termsSkipped: [] as string[],
    };

    const allClasses = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    const matches = allClasses.filter((c) => normalizeName(c.name) === norm);

    for (const cls of matches) {
      const studentsInClass = await ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(5000);
      if (studentsInClass.some((s) => s.classId === cls._id)) {
        report.classesSkipped.push(cls.name);
        continue;
      }
      const structures = await ctx.db
        .query("fee_structures")
        .withIndex("by_class_term", (q) => q.eq("classId", cls._id))
        .take(500);
      for (const s of structures) {
        await ctx.db.delete(s._id);
        report.structuresRemoved++;
      }
      const streams = await ctx.db
        .query("streams")
        .withIndex("by_classId", (q) => q.eq("classId", cls._id))
        .take(500);
      for (const st of streams) {
        await ctx.db.delete(st._id);
        report.streamsRemoved++;
      }
      await ctx.db.delete(cls._id);
      report.classesRemoved++;
    }

    if (args.deleteEmptyTerms) {
      const terms = await ctx.db
        .query("terms")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(500);
      for (const term of terms) {
        const [structures, payments, exams, assignments] = await Promise.all([
          ctx.db
            .query("fee_structures")
            .withIndex("by_term", (q) => q.eq("schoolId", args.schoolId).eq("termId", term._id))
            .take(1),
          ctx.db
            .query("fee_payments")
            .withIndex("by_term", (q) => q.eq("schoolId", args.schoolId).eq("termId", term._id))
            .take(1),
          ctx.db.query("exams").withIndex("by_termId", (q) => q.eq("termId", term._id)).take(1),
          ctx.db.query("classAssignments").withIndex("by_termId", (q) => q.eq("termId", term._id)).take(1),
        ]);
        if (structures.length || payments.length || exams.length || assignments.length) {
          report.termsSkipped.push(`${term.name} ${term.year}`);
          continue;
        }
        await ctx.db.delete(term._id);
        report.termsRemoved++;
      }
    }

    return report;
  },
});
