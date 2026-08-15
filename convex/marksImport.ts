/**
 * Marks / exam results import (flexibility phase 2)
 *
 * Imports a marks file (per-student, per-subject scores) into exam_results.
 * Students resolve by admission number first (deterministic), then by name
 * through the identity engine: confident → auto-link, ambiguous → the review
 * queue, no match → reported back. Subjects match by name (case-insensitive)
 * and are reported when unknown — nothing is invented.
 */
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { identityRowKey, rankCandidates, decideMatch, PersonRef } from "./identity";

export const getStudentsForMarks = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);
  },
});

export const getSubjectsForMarks = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("subjects")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

export const insertMarksInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    examId: v.id("exams"),
    chunk: v.array(
      v.object({
        studentId: v.id("students"),
        subjectId: v.id("subjects"),
        marks: v.number(),
        grade: v.optional(v.string()),
        comment: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { schoolId, examId, chunk }) => {
    let created = 0;
    let updated = 0;
    for (const r of chunk) {
      const existing = await ctx.db
        .query("exam_results")
        .withIndex("by_examId_and_subjectId", (q) =>
          q.eq("examId", examId).eq("subjectId", r.subjectId)
        )
        .filter((q) => q.eq(q.field("studentId"), r.studentId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          marks: r.marks,
          grade: r.grade,
          comment: r.comment,
        });
        updated++;
      } else {
        await ctx.db.insert("exam_results", {
          schoolId,
          examId,
          studentId: r.studentId,
          subjectId: r.subjectId,
          marks: r.marks,
          grade: r.grade,
          comment: r.comment,
        });
        created++;
      }
    }
    return { created, updated };
  },
});

export const importMarks = action({
  args: {
    schoolId: v.id("schools"),
    examId: v.id("exams"),
    rows: v.array(
      v.object({
        admNo: v.optional(v.string()),
        studentName: v.optional(v.string()),
        className: v.optional(v.string()),
        subjectName: v.string(),
        marks: v.number(),
        grade: v.optional(v.string()),
        comment: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Actions have no `db`, so requirePrincipal doesn't apply here — this is
    // the same org-gated pattern as aiAssistant.verifySchoolAccess.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.org_id) throw new Error("No active organisation — select a school first");
    const school = await ctx.runQuery(internal.schools.getById, { id: args.schoolId });
    if (!school) throw new Error("School not found");
    if (school.clerkOrgId !== identity.org_id) {
      throw new Error("Not authorised for this school");
    }
    const students = await ctx.runQuery(internal.marksImport.getStudentsForMarks, {
      schoolId: args.schoolId,
    });
    const subjects = await ctx.runQuery(internal.marksImport.getSubjectsForMarks, {
      schoolId: args.schoolId,
    });

    const byAdm = new Map<string, Id<"students">>();
    // Class corroboration is applied when the caller supplies a className;
    // student docs carry classId, resolved to names below if needed.
    // Phase 18: DOB is a school-defined EAV field — it's not part of the
    // typed core, so PersonRefs don't carry it (identity corroboration in
    // this flow uses name + class).
    const people: PersonRef[] = students.map((s) => ({
      id: s._id,
      firstName: s.firstName,
      lastName: s.lastName,
    }));
    for (const s of students) byAdm.set(s.admNo.trim().toLowerCase(), s._id);

    const subjectByName = new Map<string, Id<"subjects">>();
    for (const sub of subjects) subjectByName.set(sub.name.trim().toLowerCase(), sub._id);

    const errors: { row: number; reason: string }[] = [];
    let needsReview = 0;
    const resolvable: {
      studentId: Id<"students">;
      subjectId: Id<"subjects">;
      marks: number;
      grade?: string;
      comment?: string;
    }[] = [];
    const reviews: { rowKey: string; name: string; sourceFile?: string }[] = [];
    // Links to remember (auto-matched + ambiguous) — written to identity_links
    // once per rowKey so re-imports match instantly and the review queue fills.
    const linkRecords: {
      rowKey: string;
      name: string;
      resolvedId?: Id<"students">;
      confidence: number;
      status: "auto" | "needs_review";
    }[] = [];

    for (let i = 0; i < args.rows.length; i++) {
      const r = args.rows[i]!;
      const rowNum = i + 2; // 1-based + header row

      const subjectId = r.subjectName
        ? subjectByName.get(r.subjectName.trim().toLowerCase())
        : undefined;
      if (!subjectId) {
        errors.push({ row: rowNum, reason: `Unknown subject "${r.subjectName}"` });
        continue;
      }

      // 1. Exact admission number.
      let studentId: Id<"students"> | undefined;
      if (r.admNo) {
        studentId = byAdm.get(r.admNo.trim().toLowerCase());
        if (!studentId) {
          errors.push({ row: rowNum, reason: `No student with admission number "${r.admNo}"` });
          continue;
        }
      } else if (r.studentName) {
        // 2. Name matching via the identity engine.
        const [first, ...rest] = r.studentName.trim().split(/\s+/);
        const last = rest.join(" ");
        const rowKey = identityRowKey(first, last, r.className);
        // 2a. A remembered link (human decision or prior auto-match) always wins.
        const remembered = await ctx.runQuery(
          internal.identity.getIdentityLinkByRowKey,
          { schoolId: args.schoolId, entityKind: "student", rowKey }
        );
        if (remembered && (remembered.status === "resolved" || remembered.status === "auto") && remembered.resolvedId) {
          studentId = remembered.resolvedId as Id<"students">;
        } else {
          const candidates = rankCandidates(first, last, r.className, undefined, people);
          const decision = decideMatch(candidates);
          if (decision.status === "auto" && decision.candidate) {
            studentId = decision.candidate.id as Id<"students">;
            linkRecords.push({
              rowKey,
              name: r.studentName,
              resolvedId: studentId,
              confidence: decision.candidate.score,
              status: "auto",
            });
          } else if (decision.status === "review" && decision.candidate) {
            needsReview++;
            reviews.push({ rowKey, name: r.studentName, sourceFile: "marks import" });
            linkRecords.push({
              rowKey,
              name: r.studentName,
              confidence: decision.candidate.score,
              status: "needs_review",
            });
            continue;
          } else {
            errors.push({ row: rowNum, reason: `No student matched for "${r.studentName}"` });
            continue;
          }
        }
      } else {
        errors.push({ row: rowNum, reason: "Row has no admission number or student name" });
        continue;
      }

      resolvable.push({
        studentId,
        subjectId,
        marks: r.marks,
        grade: r.grade,
        comment: r.comment,
      });
    }

    // Remember links (deduped by rowKey) so the review queue fills and
    // re-imports of the same file resolve instantly.
    const seenKeys = new Set<string>();
    for (const link of linkRecords) {
      if (seenKeys.has(link.rowKey)) continue;
      seenKeys.add(link.rowKey);
      await ctx.runMutation(internal.identity.recordIdentityLinkInternal, {
        schoolId: args.schoolId,
        entityKind: "student",
        rowKey: link.rowKey,
        name: link.name,
        resolvedId: link.resolvedId,
        confidence: link.confidence,
        status: link.status,
        sourceFile: "marks import",
      });
    }

    let created = 0;
    let updated = 0;
    for (let start = 0; start < resolvable.length; start += 100) {
      const chunk = resolvable.slice(start, start + 100);
      const res = await ctx.runMutation(internal.marksImport.insertMarksInternal, {
        schoolId: args.schoolId,
        examId: args.examId,
        chunk,
      });
      created += res.created;
      updated += res.updated;
    }

    // Audit: record the run so it shows up in Bulk Operations → Files like
    // every other import kind, with per-outcome summary rows.
    const rowResults: {
      row: number;
      kind: "student";
      status: "created" | "overwritten" | "error";
      reason: string;
    }[] = [];
    if (created > 0) rowResults.push({ row: 1, kind: "student", status: "created", reason: `${created} marks recorded` });
    if (updated > 0) rowResults.push({ row: 2, kind: "student", status: "overwritten", reason: `${updated} existing marks updated` });
    if (needsReview > 0) rowResults.push({ row: 3, kind: "student", status: "error", reason: `${needsReview} rows sent to the review queue (ambiguous names)` });
    for (const e of errors.slice(0, 100)) rowResults.push({ row: e.row, kind: "student", status: "error", reason: e.reason });
    await ctx.runMutation(internal.imports.recordImportRunInternal, {
      schoolId: args.schoolId,
      fileName: "marks import",
      ok: errors.length === 0 && needsReview === 0,
      summary: {
        studentsCreated: created,
        studentsSkipped: 0,
        studentsOverwritten: updated,
        staffCreated: 0,
        staffSkipped: 0,
        staffOverwritten: 0,
        structuresCreated: 0,
        errors: errors.length + needsReview,
      },
      rowResults,
    });

    return { created, updated, needsReview, errors, reviewRows: reviews.length };
  },
});
