import { v } from "convex/values";
import { query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireStudentMembership, requireModuleEditAccessByName } from "./helpers";
import { loadStudentEavValues } from "./studentEavLookup";

/**
 * Student 360 — everything about one student in a single round trip.
 *
 * Returns the student document plus:
 *  - class / stream names
 *  - exam results enriched with exam + subject names (newest first)
 *  - attendance records + status counts
 *  - borrowing history
 *  - fines with outstanding balance
 *
 * This is the one function every future phase (fees, progress, report
 * cards) extends — new tabs just add fields here.
 */
export const getFullProfile = query({
  args: { id: v.id("students") },
  handler: async (ctx, { id }) => {
    const student = await requireStudentMembership(ctx, id);
    await requireModuleEditAccessByName(ctx, student.schoolId, "Academics");

    const [cls, stream, examResults, attendance, borrowings, fines] = await Promise.all([
      ctx.db.get(student.classId),
      student.streamId ? ctx.db.get(student.streamId) : Promise.resolve(null),
      ctx.db
        .query("exam_results")
        .withIndex("by_studentId", (q) => q.eq("studentId", id))
        .order("desc")
        .take(100),
      ctx.db
        .query("attendance")
        .withIndex("by_studentId", (q) => q.eq("studentId", id))
        .order("desc")
        .take(100),
      ctx.db
        .query("borrowings")
        .withIndex("by_studentId", (q) => q.eq("studentId", id))
        .order("desc")
        .take(50),
      ctx.db
        .query("fines")
        .withIndex("by_studentId", (q) => q.eq("studentId", id))
        .order("desc")
        .take(50),
    ]);

    // Enrich exam results with exam + subject names.
    const examIds = [...new Set(examResults.map((r) => r.examId))] as Id<"exams">[];
    const subjectIds = [...new Set(examResults.map((r) => r.subjectId))] as Id<"subjects">[];
    const [exams, subjects] = await Promise.all([
      Promise.all(examIds.map((eid) => ctx.db.get(eid))),
      Promise.all(subjectIds.map((sid) => ctx.db.get(sid))),
    ]);
    const examById = new Map(exams.filter(Boolean).map((e) => [e!._id, e as Doc<"exams">]));
    const subjectById = new Map(subjects.filter(Boolean).map((s) => [s!._id, s as Doc<"subjects">]));

    const enrichedResults = examResults.map((r) => {
      const exam = examById.get(r.examId);
      const subject = subjectById.get(r.subjectId);
      return {
        _id: r._id,
        examId: r.examId,
        examName: exam?.name ?? "—",
        examDate: exam?.date ?? null,
        examType: exam?.examType ?? null,
        termId: exam?.termId ?? null,
        subjectId: r.subjectId,
        subjectName: subject?.name ?? "—",
        marks: r.marks,
        grade: r.grade ?? null,
        comment: r.comment ?? null,
        _creationTime: r._creationTime,
      };
    });

    // Attendance counts (no wall clock needed).
    const attendanceCounts = {
      present: attendance.filter((a) => a.status === "present").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      late: attendance.filter((a) => a.status === "late").length,
      excused: attendance.filter((a) => a.status === "excused").length,
    };

    const finesWithBalance = fines.map((f) => ({
      ...f,
      outstanding: f.amount - f.paidAmount,
    }));

    // ── School fees (current term, with credit carry-over) ─────────────
    // Overpayments in earlier terms reduce what the current term owes. Any
    // credit left over is money the school owes the student — surfaced here
    // so the profile never shows a wrong "outstanding" figure.
    const allTerms = (
      await ctx.db
        .query("terms")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", student.schoolId))
        .take(50)
    ).sort((a, b) => a.year - b.year || a.startDate - b.startDate);
    const now = Date.now();
    const inSession = allTerms.find((t) => t.startDate <= now && now <= t.endDate);
    const nextUpcoming = allTerms
      .filter((t) => t.startDate > now)
      .sort((a, b) => a.startDate - b.startDate)[0];
    // Current term precedence: explicitly active → legacy current flag →
    // term whose dates cover today → next upcoming term → most recent.
    const currentTerm =
      allTerms.find((t) => t.status === "active") ??
      allTerms.find((t) => t.isCurrent) ??
      inSession ??
      nextUpcoming ??
      allTerms[allTerms.length - 1] ??
      null;
    let fees: {
      term: { _id: Id<"terms">; name: string; year: number };
      expected: number;
      creditFromPrior: number;
      effectiveExpected: number;
      paid: number;
      balance: number;
      credit: number;
      schoolOwes: number;
      hasStructure: boolean;
      payments: Doc<"fee_payments">[];
    } | null = null;
    if (currentTerm) {
      const [structures, allFeePayments] = await Promise.all([
        ctx.db
          .query("fee_structures")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", student.schoolId))
          .take(500),
        ctx.db
          .query("fee_payments")
          .withIndex("by_studentId", (q) => q.eq("studentId", student._id))
          .order("desc")
          .take(500),
      ]);
      const structureAmountFor = (classId: Id<"classes">, streamId: Id<"streams"> | undefined, termId: Id<"terms">) => {
        const streamMatch = structures.find((s) => s.classId === classId && s.termId === termId && s.streamId === streamId);
        if (streamMatch) return streamMatch.amount;
        const classMatch = structures.find((s) => s.classId === classId && s.termId === termId && s.streamId === undefined);
        return classMatch?.amount ?? 0;
      };
      let carryOver = 0;
      let row: {
        expected: number;
        creditFromPrior: number;
        effectiveExpected: number;
        paid: number;
        balance: number;
        credit: number;
      } | null = null;
      for (const term of allTerms) {
        const expected = structureAmountFor(student.classId, student.streamId, term._id);
        const paid = allFeePayments.filter((p) => p.termId === term._id).reduce((s, p) => s + p.amount, 0);
        const creditFromPrior = Math.min(expected, carryOver);
        const effectiveExpected = expected - creditFromPrior;
        const balance = effectiveExpected - paid;
        const credit = paid > effectiveExpected ? paid - effectiveExpected : 0;
        // Accumulate unused prior credit + this term's surplus (never drop leftover credit).
        carryOver = Math.max(0, carryOver + paid - expected);
        if (term._id === currentTerm._id) {
          row = { expected, creditFromPrior, effectiveExpected, paid, balance, credit };
        }
      }
      if (row) {
        const feePayments = allFeePayments
          .filter((p) => p.termId === currentTerm._id)
          .sort((a, b) => b.receivedAt - a.receivedAt);
        fees = {
          term: { _id: currentTerm._id, name: currentTerm.name, year: currentTerm.year },
          expected: row.expected,
          creditFromPrior: row.creditFromPrior,
          effectiveExpected: row.effectiveExpected,
          paid: row.paid,
          balance: row.balance,
          credit: row.credit,
          schoolOwes: row.balance < 0 ? Math.abs(row.balance) : 0,
          hasStructure: row.expected > 0,
          payments: feePayments,
        };
      }
    }

    // ── Phase 18: identity extras live outside the students doc ──────────
    // Gender / date of birth / admission date are school-defined EAV fields
    // (matched by alias, so school renames survive). The primary guardian is a
    // record in the guardian ENTITY system linked via guardian_links.
    const eavByAlias = await loadStudentEavValues(ctx, student.schoolId, [
      "gender",
      "dateOfBirth",
      "admissionDate",
    ]);
    const eav = eavByAlias.get(student._id) ?? {};

    let guardian: {
      _id: string;
      firstName: string;
      lastName: string;
      phone: string;
      phone2?: string;
      email?: string;
      address?: string;
      relationship: string;
      isPrimary: boolean;
    } | null = null;
    const guardianLinks = await ctx.db
      .query("guardian_links")
      .withIndex("by_studentId", (q) => q.eq("studentId", student._id))
      .take(20);
    const primaryLink =
      guardianLinks.find((l) => l.isPrimary) ??
      guardianLinks.find((l) => !l.isPrimary) ??
      null;
    if (primaryLink) {
      const g = await ctx.db.get(primaryLink.guardianId);
      if (g) {
        guardian = {
          _id: g._id,
          firstName: g.firstName,
          lastName: g.lastName,
          phone: g.phone,
          phone2: g.phone2 ?? undefined,
          email: g.email ?? undefined,
          address: g.address ?? undefined,
          relationship: g.relationship,
          isPrimary: primaryLink.isPrimary,
        };
      }
    }

    return {
      student,
      class: cls,
      stream,
      eav,
      guardian,
      examResults: enrichedResults,
      attendance: {
        records: attendance,
        counts: attendanceCounts,
      },
      borrowings,
      fines: finesWithBalance,
      fees,
    };
  },
});
