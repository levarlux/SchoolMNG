import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";
import { checkRateLimit } from "./rateLimit";
import { internal } from "./_generated/api";

// ── School Fees (Phase 2) ───────────────────────────────────────────
// A school is a business, but the language stays school-first: fee
// structures, collections, balances, outstanding. Balances are computed
// from structures minus payments — no bill table to keep in sync.

const PAYMENT_METHODS = v.union(
  v.literal("cash"),
  v.literal("mpesa"),
  v.literal("bank_transfer"),
  v.literal("other")
);

/**
 * Sort terms chronologically (year, then start date). Credit carry-over must
 * chain through terms in real order — never insertion/_id order, or an
 * overpayment in Term 1 could be applied to the wrong later term.
 */
function sortTermsByDate(terms: Doc<"terms">[]): Doc<"terms">[] {
  return [...terms].sort((a, b) => a.year - b.year || a.startDate - b.startDate);
}

function structureAmountFor(
  structures: Doc<"fee_structures">[],
  classId: Id<"classes">,
  streamId: Id<"streams"> | undefined,
  termId: Id<"terms">
): number {
  // Stream-specific charge first, then class-level charge. The term is
  // part of the lookup so a structure set for Term 1 never leaks into
  // Term 3's expected amount (multi-term math).
  const streamMatch = structures.find(
    (s) => s.classId === classId && s.termId === termId && s.streamId === streamId
  );
  if (streamMatch) return streamMatch.amount;
  const classMatch = structures.find(
    (s) => s.classId === classId && s.termId === termId && s.streamId === undefined
  );
  return classMatch?.amount ?? 0;
}

// ── P2#14: EAV-aware fee resolution ───────────────────────────────
// When a school has useEavForFees configured, fee amounts are read
// from EAV fieldValues (the school's own "Tuition Fee" field tagged
// with semantic: "amount") instead of the hardcoded fee_structures table.

/**
 * Build a Map<studentId, amount> of EAV fee amounts for a batch of students.
 * Returns null if the school hasn't configured useEavForFees.
 */
async function buildEavFeeMap(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
  studentIds: Id<"students">[],
): Promise<Map<string, number> | null> {
  const config = await ctx.db
    .query("fee_config")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .first();
  if (!config || !config.useEavForFees || !config.amountFieldId) return null;

  const eavMap = new Map<string, number>();
  for (const studentId of studentIds) {
    const record = await ctx.db
      .query("records")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();
    if (!record) continue;
    const fv = await ctx.db
      .query("fieldValues")
      .withIndex("by_recordId_fieldId", (q) =>
        q.eq("recordId", record._id).eq("fieldId", config.amountFieldId!)
      )
      .first();
    if (fv) {
      const amt = parseFloat(fv.value);
      if (!isNaN(amt) && amt > 0) eavMap.set(studentId, amt);
    }
  }
  return eavMap;
}

/**
 * Resolve the fee amount for a student: EAV first (if configured), then
 * fallback to the hardcoded fee_structures table.
 */
function resolveFeeAmount(
  eavMap: Map<string, number> | null,
  studentId: string,
  structures: Doc<"fee_structures">[],
  classId: Id<"classes">,
  streamId: Id<"streams"> | undefined,
  termId: Id<"terms">
): number {
  // EAV takes precedence when configured
  if (eavMap) {
    const eavAmount = eavMap.get(studentId);
    if (eavAmount !== undefined) return eavAmount;
  }
  // Fallback to hardcoded fee_structures
  return structureAmountFor(structures, classId, streamId, termId);
}

// ── Shared multi-term engine ────────────────────────────────────────
// Builds a per-term fee position for every student with credit
// carry-over: overpayments in earlier terms reduce what later terms owe,
// and any credit left at the end is money the school owes the student.

type TermRow = {
  termId: Id<"terms">;
  termName: string;
  termYear: number;
  expected: number;
  creditFromPrior: number;
  effectiveExpected: number;
  paid: number;
  balance: number;
  credit: number;
  status: "cleared" | "owing" | "overpaid" | "no_structure";
};

type MultiTermRow = {
  student: Doc<"students">;
  terms: TermRow[];
  totalExpected: number;
  totalPaid: number;
  totalBalance: number;
  schoolOwes: number;
  fullyCleared: boolean;
};

async function buildMultiTermRows(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
  terms: Doc<"terms">[],
  students: Doc<"students">[],
  allStructures: Doc<"fee_structures">[]
): Promise<MultiTermRow[]> {
  terms = sortTermsByDate(terms);

  // P2#14: Build EAV fee map if configured
  const eavFeeMap = await buildEavFeeMap(ctx, schoolId, students.map((s) => s._id));

  const allPayments = await ctx.db
    .query("fee_payments")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(10000);

  const paymentMap = new Map<string, number>();
  for (const p of allPayments) {
    const key = `${p.studentId}:${p.termId}`;
    paymentMap.set(key, (paymentMap.get(key) ?? 0) + p.amount);
  }

  const results: MultiTermRow[] = [];
  for (const student of students) {
    let carryOver = 0;
    const termRows: TermRow[] = [];
    let totalExpected = 0;
    let totalPaid = 0;

    for (const term of terms) {
      // P2#14: EAV-aware fee resolution — EAV first, then fee_structures
      const expected = resolveFeeAmount(eavFeeMap, student._id, allStructures, student.classId, student.streamId, term._id);
      const paid = paymentMap.get(`${student._id}:${term._id}`) ?? 0;
      const creditFromPrior = Math.min(expected, carryOver);
      const effectiveExpected = expected - creditFromPrior;
      const balance = effectiveExpected - paid;

      const credit = paid > effectiveExpected ? paid - effectiveExpected : 0;
      // Accumulate, don't replace: unused prior credit carries on to later terms.
      carryOver = Math.max(0, carryOver + paid - expected);

      let status: TermRow["status"];
      if (expected === 0) {
        status = "no_structure";
      } else if (balance < 0) {
        status = "overpaid";
      } else if (balance === 0) {
        status = "cleared";
      } else {
        status = "owing";
      }

      totalExpected += expected;
      totalPaid += paid;
      termRows.push({
        termId: term._id,
        termName: term.name,
        termYear: term.year,
        expected,
        creditFromPrior,
        effectiveExpected,
        paid,
        balance,
        credit,
        status,
      });
    }

    const totalBalance = totalExpected - totalPaid;
    const schoolOwes = totalBalance < 0 ? Math.abs(totalBalance) : 0;
    results.push({
      student,
      terms: termRows,
      totalExpected,
      totalPaid,
      totalBalance,
      schoolOwes,
      fullyCleared: totalExpected > 0 && totalBalance <= 0,
    });
  }

  return results;
}

// ── Read-only queries ───────────────────────────────────────────────

/** Fee structures for a term, with class/stream names. */
export const listStructures = query({
  args: { schoolId: v.id("schools"), termId: v.id("terms") },
  handler: async (ctx, { schoolId, termId }) => {
    await requireModuleAccessByName(ctx, schoolId, "Finance");
    const structures = await ctx.db
      .query("fee_structures")
      .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId))
      .take(500);

    const classIds = [...new Set(structures.map((s) => s.classId))] as Id<"classes">[];
    const streamIds = [
      ...new Set(structures.map((s) => s.streamId).filter(Boolean)),
    ] as Id<"streams">[];
    const [classes, streams] = await Promise.all([
      Promise.all(classIds.map((id) => ctx.db.get(id))),
      Promise.all(streamIds.map((id) => ctx.db.get(id))),
    ]);
    const classById = new Map(classes.filter(Boolean).map((c) => [c!._id, c as Doc<"classes">]));
    const streamById = new Map(streams.filter(Boolean).map((s) => [s!._id, s as Doc<"streams">]));

    return structures.map((s) => ({
      ...s,
      className: classById.get(s.classId)?.name ?? "—",
      streamName: s.streamId ? streamById.get(s.streamId)?.name ?? "—" : null,
    }));
  },
});

/** Payment records (newest first), with student names. */
export const listPayments = query({
  args: { schoolId: v.id("schools"), termId: v.optional(v.id("terms")) },
  handler: async (ctx, { schoolId, termId }) => {
    await requireModuleAccessByName(ctx, schoolId, "Finance");
    const payments = termId
      ? await ctx.db
          .query("fee_payments")
          .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId))
          .order("desc")
          .take(500)
      : await ctx.db
          .query("fee_payments")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .order("desc")
          .take(500);

    const studentIds = [...new Set(payments.map((p) => p.studentId))] as Id<"students">[];
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
    const studentById = new Map(students.filter(Boolean).map((s) => [s!._id, s as Doc<"students">]));

    return payments.map((p) => {
      const s = studentById.get(p.studentId);
      return {
        ...p,
        studentName: s ? `${s.firstName} ${s.lastName}` : "—",
        admNo: s?.admNo ?? "—",
      };
    });
  },
});

/** Term-level totals: expected, collected, outstanding, collection rate. */
export const getTermSummary = query({
  args: { schoolId: v.id("schools"), termId: v.id("terms") },
  handler: async (ctx, { schoolId, termId }) => {
    await requireModuleAccessByName(ctx, schoolId, "Finance");
    const [students, structures, payments] = await Promise.all([
      ctx.db.query("students").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(1000),
      ctx.db.query("fee_structures").withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId)).take(500),
      ctx.db.query("fee_payments").withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId)).take(5000),
    ]);

    const paidByStudent = new Map<string, number>();
    for (const p of payments) {
      paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) ?? 0) + p.amount);
    }

    // Credit carried into this term from overpayments in earlier terms.
    // A student who overpaid Term 1 has a credit that reduces what they owe
    // this term — so "outstanding" must not double-count that money.
    const priorTerms = sortTermsByDate(
      await ctx.db
        .query("terms")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .order("asc")
        .take(20)
    );
    const priorStructures = await ctx.db
      .query("fee_structures")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
    const priorPayments = await ctx.db
      .query("fee_payments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);
    const priorPaymentMap = new Map<string, number>();
    for (const p of priorPayments) {
      const key = `${p.studentId}:${p.termId}`;
      priorPaymentMap.set(key, (priorPaymentMap.get(key) ?? 0) + p.amount);
    }
    // P2#14: Build EAV fee map if configured
    const eavFeeMap = await buildEavFeeMap(ctx, schoolId, students.map((s) => s._id));

    const priorCreditByStudent = new Map<string, number>();
    for (const s of students) {
      let credit = 0;
      for (const t of priorTerms) {
        if (t._id === termId) break;
        const expected = resolveFeeAmount(eavFeeMap, s._id, priorStructures, s.classId, s.streamId, t._id);
        const paid = priorPaymentMap.get(`${s._id}:${t._id}`) ?? 0;
        credit = Math.max(0, credit + paid - expected);
      }
      priorCreditByStudent.set(s._id, credit);
    }

    let expected = 0;
    let effectiveExpectedTotal = 0;
    let debtors = 0;
    let overpaidCount = 0;
    let creditApplied = 0;
    let overpaidAmount = 0; // total the school owes back (paid beyond effective expected)
    for (const s of students) {
      const amount = resolveFeeAmount(eavFeeMap, s._id, structures, s.classId, s.streamId, termId);
      const paid = paidByStudent.get(s._id) ?? 0;
      const credit = Math.min(amount, priorCreditByStudent.get(s._id) ?? 0);
      expected += amount;
      effectiveExpectedTotal += amount - credit;
      creditApplied += credit;
      const balance = amount - credit - paid;
      if (balance > 0) debtors++;
      if (paid > amount - credit) {
        overpaidCount++;
        overpaidAmount += paid - (amount - credit);
      }
    }

    const collected = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = Math.max(0, effectiveExpectedTotal - collected);
    // Money paid beyond what is actually owed = credit the school owes back.
    const schoolOwes = Math.max(0, collected - effectiveExpectedTotal);
    const collectible = effectiveExpectedTotal > 0 ? effectiveExpectedTotal : expected;
    return {
      expected,
      collected,
      outstanding,
      schoolOwes,
      overpaidAmount,
      creditApplied,
      overpaidCount,
      collectionRate: collectible > 0 ? Math.round(((collectible - outstanding) / collectible) * 100) : 0,
      feeSource: eavFeeMap ? "eav" : "fee_structures", // P2#14: which engine computed fees
      debtors,
      paymentCount: payments.length,
      studentCount: students.length,
    };
  },
});

/**
 * Every student's fee position for a term, sorted by balance (highest
 * first). Powers the Balances tab and the outstanding list.
 */
export const listStudentFees = query({
  args: { schoolId: v.id("schools"), termId: v.id("terms") },
  handler: async (ctx, { schoolId, termId }) => {
    await requireModuleAccessByName(ctx, schoolId, "Finance");
    const [students, structures, payments] = await Promise.all([
      ctx.db.query("students").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(1000),
      ctx.db.query("fee_structures").withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId)).take(500),
      ctx.db.query("fee_payments").withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", termId)).take(5000),
    ]);

    const paidByStudent = new Map<string, number>();
    for (const p of payments) {
      paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) ?? 0) + p.amount);
    }

    // P2#14: Build EAV fee map if configured
    const eavFeeMap = await buildEavFeeMap(ctx, schoolId, students.map((s) => s._id));

    const rows = students.map((s) => {
      const expected = resolveFeeAmount(eavFeeMap, s._id, structures, s.classId, s.streamId, termId);
      const paid = paidByStudent.get(s._id) ?? 0;
      return {
        student: s,
        expected,
        paid,
        balance: expected - paid,
      };
    });

    return rows.sort((a, b) => b.balance - a.balance);
  },
});

/**
 * Multi-term fee position for every student — shows per-term breakdown with
 * carry-over logic. If a student overpays in term 1, the credit reduces
 * their expected amount in term 2, and so on. Any credit left over at the
 * end is money the school owes the student.
 *
 * Returns: array of { student, terms, totalExpected, totalPaid, totalBalance,
 * schoolOwes, fullyCleared } where each term has
 * { termId, expected, creditFromPrior, effectiveExpected, paid, balance,
 * credit, status } and status = cleared|owing|overpaid|no_structure.
 */
export const listStudentFeesMultiTerm = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireModuleAccessByName(ctx, schoolId, "Finance");

    // Get all terms for this school, sorted by year + start date
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("asc")
      .take(20);

    // Get all students
    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(1000);

    // Get ALL fee structures for this school
    const allStructures = await ctx.db
      .query("fee_structures")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const rows = await buildMultiTermRows(ctx, schoolId, terms, students, allStructures);

    // Sort: owing students first (highest balance), then cleared, then overpaid
    return rows.sort((a, b) => b.totalBalance - a.totalBalance);
  },
});

/** One student's fee position + payment history for the current term (profile tab).
 * Credit from overpayments in EARLIER terms is applied automatically, so a
 * student who overpaid Term 1 never sees a full Term 2 bill — and any credit
 * left over is reported as money the school owes the student. */
export const getStudentFees = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    const student = await requireStudentMembership(ctx, studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Finance");

    const terms = sortTermsByDate(
      await ctx.db
        .query("terms")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", student.schoolId))
        .take(50)
    );
    const currentTerm =
      terms.find((t) => t.status === "active") ??
      terms.find((t) => t.isCurrent) ??
      terms[terms.length - 1] ??
      null;
    if (!currentTerm) return null;

    const [structures, payments] = await Promise.all([
      ctx.db
        .query("fee_structures")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", student.schoolId))
        .take(500),
      ctx.db
        .query("fee_payments")
        .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
        .order("desc")
        .take(500),
    ]);

    // P2#14: Build EAV fee map if configured
    const eavFeeMap = await buildEavFeeMap(ctx, student.schoolId, [studentId]);

    // Walk terms chronologically up to (and including) the current one,
    // carrying over any overpayment as credit toward what is still owed.
    let carryOver = 0;
    let currentTermRow: {
      expected: number;
      creditFromPrior: number;
      effectiveExpected: number;
      paid: number;
      balance: number;
      credit: number;
    } | null = null;
    for (const term of terms) {
      const expected = resolveFeeAmount(eavFeeMap, studentId, structures, student.classId, student.streamId, term._id);
      const paid = payments.filter((p) => p.termId === term._id).reduce((s, p) => s + p.amount, 0);
      const creditFromPrior = Math.min(expected, carryOver);
      const effectiveExpected = expected - creditFromPrior;
      const balance = effectiveExpected - paid;
      const credit = paid > effectiveExpected ? paid - effectiveExpected : 0;
      // Accumulate, don't replace: unused prior credit carries on to later terms.
      carryOver = Math.max(0, carryOver + paid - expected);
      if (term._id === currentTerm._id) {
        currentTermRow = { expected, creditFromPrior, effectiveExpected, paid, balance, credit };
      }
    }

    if (!currentTermRow) return null;
    const row = currentTermRow;
    const currentPayments = payments
      .filter((p) => p.termId === currentTerm._id)
      .sort((a, b) => b.receivedAt - a.receivedAt);

    return {
      term: { _id: currentTerm._id, name: currentTerm.name, year: currentTerm.year },
      expected: row.expected,
      creditFromPrior: row.creditFromPrior,
      effectiveExpected: row.effectiveExpected,
      paid: row.paid,
      balance: row.balance,
      credit: row.credit, // >= 0 → the school owes the student this much
      schoolOwes: row.balance < 0 ? Math.abs(row.balance) : 0,
      hasStructure: row.expected > 0,
      payments: currentPayments,
    };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/** Set (or update) what a class/stream is charged for a term. */
export const setFeeStructure = mutation({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    termId: v.id("terms"),
    streamId: v.optional(v.id("streams")),
    amount: v.number(),
  },
  handler: async (ctx, { schoolId, classId, termId, streamId, amount }) => {
    await requireModuleEditAccessByName(ctx, schoolId, "Finance");
    if (amount < 0) throw new Error("Fee amount cannot be negative");

    const cls = await ctx.db.get(classId);
    if (!cls || cls.schoolId !== schoolId) throw new Error("Class not found");
    if (streamId) {
      const stream = await ctx.db.get(streamId);
      if (!stream || stream.classId !== classId) {
        throw new Error("Stream does not belong to this class");
      }
    }

    const existing = await ctx.db
      .query("fee_structures")
      .withIndex("by_class_term", (q) => q.eq("classId", classId).eq("termId", termId))
      .take(20);
    const match = existing.find((e) => (e.streamId ?? null) === (streamId ?? null));

    if (match) {
      await ctx.db.patch(match._id, { amount });
    } else {
      await ctx.db.insert("fee_structures", { schoolId, classId, termId, streamId, amount });
    }
    await logAuditEntry(ctx, schoolId, "feeStructure.set", { classId, termId, streamId, amount });
  },
});

export const removeFeeStructure = mutation({
  args: { id: v.id("fee_structures") },
  handler: async (ctx, { id }) => {
    const structure = await ctx.db.get(id);
    if (!structure) throw new Error("Fee structure not found");
    await requireModuleEditAccessByName(ctx, structure.schoolId, "Finance");
    await ctx.db.delete(id);
    await logAuditEntry(ctx, structure.schoolId, "feeStructure.remove", { structureId: id });
  },
});

/** Record a fee payment for a student. */
export const recordPayment = mutation({
  args: {
    studentId: v.id("students"),
    termId: v.id("terms"),
    amount: v.number(),
    method: PAYMENT_METHODS,
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleEditAccessByName(ctx, student.schoolId, "Finance");
    // Rate limit: max 10 payments per user per minute
    await checkRateLimit(ctx, `fee-payment:${student.schoolId}`, 10, 60_000);
    if (args.amount <= 0) throw new Error("Payment amount must be positive");

    const term = await ctx.db.get(args.termId);
    if (!term || term.schoolId !== student.schoolId) {
      throw new Error("Term does not belong to this school");
    }

    const identity = await ctx.auth.getUserIdentity();
    const paymentId = await ctx.db.insert("fee_payments", {
      schoolId: student.schoolId,
      studentId: args.studentId,
      termId: args.termId,
      amount: args.amount,
      method: args.method,
      reference: args.reference,
      note: args.note,
      receivedBy: identity?.subject ?? "system",
      receivedAt: Date.now(),
    });
    await logAuditEntry(ctx, student.schoolId, "feePayment.record", {
      paymentId,
      studentId: args.studentId,
      termId: args.termId,
      amount: args.amount,
      method: args.method,
    });
    return paymentId;
  },
});
