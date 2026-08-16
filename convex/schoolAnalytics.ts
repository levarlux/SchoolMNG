import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import {
  requireAuth,
  requireActiveMembership,
  requireSchoolMembership,
  requirePrincipal,
  isLeadershipRoleKey,
} from "./helpers";
import { Doc, Id } from "./_generated/dataModel";
import { CACHE_TTL_MS } from "./dashboardCache";

/**
 * Phase 9.1 — School-level enterprise analytics, auth-gated.
 *
 * Every query here enforces tenant isolation (`requireSchoolMembership`)
 * and, where the data is sensitive (finance), leadership role
 * (`requirePrincipal`). Nothing is ever returned for a school the caller
 * doesn't belong to.
 *
 * Note: `convex/analytics.ts` holds the *platform* (superadmin) analytics;
 * this module is the per-school dashboard/analytics surface.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

async function resolveRole(
  ctx: QueryCtx,
  schoolId: Id<"schools">
): Promise<string | null> {
  const identity = await requireAuth(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_userId_and_schoolId", (q) =>
      q.eq("userId", identity.subject).eq("schoolId", schoolId)
    )
    .first();
  return member?.role ?? null;
}

// ── Shared logic (plain functions so queries can reuse without ctx.runQuery) ──

async function feeAnalytics(ctx: QueryCtx, schoolId: Id<"schools">, termIdOverride?: Id<"terms">) {
  const terms = await ctx.db
    .query("terms")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(50);

  const term = (termIdOverride ? terms.find((t) => t._id === termIdOverride) : undefined)
    ?? terms.find((t) => t.status === "active")
    ?? terms[0];

  const [classes, structures, payments] = await Promise.all([
    ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500),
    term ? ctx.db
      .query("fee_structures")
      .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", term._id))
      .take(500) : Promise.resolve([]),
    term ? ctx.db
      .query("fee_payments")
      .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", term._id))
      .take(5000) : Promise.resolve([]),
  ]);

  const classById = new Map(classes.map((c) => [c._id, c.name]));
  const termStructures = term
    ? structures.filter((s) => s.termId === term._id)
    : [];
  const structureByClass = new Map<Id<"classes">, number>(
    termStructures.map((s) => [s.classId, s.amount])
  );
  
  // OPTIMIZATION: Fetch all students in ONE query instead of per-class.
  // The by_schoolId index returns them all, and we filter to classes with fees.
  const classesWithFees = new Set(termStructures.map(s => s.classId));
  const allStudents = await ctx.db
    .query("students")
    .withIndex("by_schoolId", q => q.eq("schoolId", schoolId))
    .take(5000);
  const students = allStudents.filter(s => classesWithFees.has(s.classId));

  const termPayments = term
    ? payments.filter((p) => p.termId === term._id)
    : [];

  const expected = students.reduce(
    (sum, s) => sum + (structureByClass.get(s.classId) ?? 0),
    0
  );
  const collected = termPayments.reduce((sum, p) => sum + p.amount, 0);

  // Collection trend — last 12 weeks, weekly buckets.
  const now = Date.now();
  const trend: { label: string; collected: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = now - i * WEEK;
    const label = new Date(weekStart).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const weekCollected = termPayments
      .filter(
        (p) => p.receivedAt >= weekStart && p.receivedAt < weekStart + WEEK
      )
      .reduce((sum, p) => sum + p.amount, 0);
    trend.push({ label, collected: weekCollected });
  }

  // Per-class expected vs collected.
  const paidByStudent = new Map<Id<"students">, number>();
  for (const p of termPayments) {
    paidByStudent.set(
      p.studentId,
      (paidByStudent.get(p.studentId) ?? 0) + p.amount
    );
  }
  const classMap = new Map<
    Id<"classes">,
    { expected: number; collected: number }
  >();
  for (const s of students) {
    const entry = classMap.get(s.classId) ?? { expected: 0, collected: 0 };
    entry.expected += structureByClass.get(s.classId) ?? 0;
    entry.collected += paidByStudent.get(s._id) ?? 0;
    classMap.set(s.classId, entry);
  }
  const byClass = [...classMap.entries()]
    .map(([classId, v]) => ({
      className: classById.get(classId) ?? "Unknown",
      expected: v.expected,
      collected: v.collected,
      rate:
        v.expected > 0 ? Math.round((v.collected / v.expected) * 100) : 0,
    }))
    .filter((c) => c.expected > 0 || c.collected > 0)
    .sort((a, b) => b.rate - a.rate);

  // By payment method.
  const methodTotals = new Map<string, number>();
  for (const p of termPayments) {
    methodTotals.set(p.method, (methodTotals.get(p.method) ?? 0) + p.amount);
  }
  const byMethod = [...methodTotals.entries()].map(([method, amount]) => ({
    method,
    amount,
  }));

  // Top debtors (students with a fee structure whose paid < expected).
  const topDebtors = [...students]
    .filter((s) => (structureByClass.get(s.classId) ?? 0) > 0)
    .map((s) => {
      const exp = structureByClass.get(s.classId) ?? 0;
      const paid = paidByStudent.get(s._id) ?? 0;
      return {
        studentId: s._id,
        name: `${s.firstName} ${s.lastName}`,
        admNo: s.admNo,
        className: classById.get(s.classId) ?? "Unknown",
        expected: exp,
        paid,
        balance: exp - paid,
      };
    })
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  return {
    termName: term ? `${term.name} ${term.year}` : null,
    expected,
    collected,
    outstanding: Math.max(0, expected - collected),
    collectionRate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
    paymentCount: termPayments.length,
    trend,
    byClass,
    byMethod,
    topDebtors,
    studentCount: students.length,
  };
}

async function academicAnalytics(ctx: QueryCtx, schoolId: Id<"schools">, termIdOverride?: Id<"terms">) {
  const [exams, classes, subjects] = await Promise.all([
    ctx.db
      .query("exams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200),
    ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500),
    ctx.db
      .query("subjects")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200),
  ]);

  // Filter exams to a specific term when requested.
  const termFilteredExams = termIdOverride
    ? exams.filter((e) => e.termId === termIdOverride)
    : exams;

  const classById = new Map(classes.map((c) => [c._id, c.name]));
  const subjectById = new Map(subjects.map((s) => [s._id, s.name]));

  // Exam mean trend — every exam with results, ordered by date (max 8).
  const sortedExams = [...termFilteredExams].sort((a, b) => a.date - b.date);
  
  // OPTIMIZATION: Only fetch results for the last 8 exams to avoid massive I/O
  const relevantExams = sortedExams.slice(-8);
  const results: Doc<"exam_results">[] = [];
  for (const exam of relevantExams) {
    const examResults = await ctx.db
      .query("exam_results")
      .withIndex("by_examId", q => q.eq("examId", exam._id))
      .collect();
    results.push(...examResults.filter(r => r.schoolId === schoolId));
  }
  const examTrend = sortedExams
    .map((exam) => {
      const examResults = results.filter((r) => r.examId === exam._id);
      if (examResults.length === 0) return null;
      const mean =
        examResults.reduce((sum, r) => sum + r.marks, 0) / examResults.length;
      return {
        label: `${exam.name} (${new Date(exam.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })})`,
        meanMarks: Math.round(mean * 10) / 10,
        students: examResults.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .slice(-8);

  // Per-class / per-subject / top students on the latest exam with results.
  const latestExam = [...sortedExams].reverse().find((exam) =>
    results.some((r) => r.examId === exam._id)
  );
  const latestResults = latestExam
    ? results.filter((r) => r.examId === latestExam._id)
    : [];

  // OPTIMIZATION: Only fetch the students present in the latest exam results
  const latestStudentIds = new Set(latestResults.map(r => r.studentId));
  const latestStudents = (await Promise.all(
    [...latestStudentIds].map(id => ctx.db.get(id))
  )).filter((s): s is NonNullable<typeof s> => s !== null && s.schoolId === schoolId);
  const studentById = new Map(latestStudents.map((s) => [s._id, s]));

  const byClassMap = new Map<Id<"classes">, { total: number; count: number }>();
  const bySubjectMap = new Map<Id<"subjects">, { total: number; count: number }>();
  const byStudentMap = new Map<
    Id<"students">,
    { total: number; count: number; classId: Id<"classes"> }
  >();
  for (const r of latestResults) {
    const student = studentById.get(r.studentId);
    if (!student) continue;
    const cls = byClassMap.get(student.classId) ?? { total: 0, count: 0 };
    cls.total += r.marks;
    cls.count += 1;
    byClassMap.set(student.classId, cls);

    const subj = bySubjectMap.get(r.subjectId) ?? { total: 0, count: 0 };
    subj.total += r.marks;
    subj.count += 1;
    bySubjectMap.set(r.subjectId, subj);

    const st = byStudentMap.get(r.studentId) ?? {
      total: 0,
      count: 0,
      classId: student.classId,
    };
    st.total += r.marks;
    st.count += 1;
    byStudentMap.set(r.studentId, st);
  }

  const byClass = [...byClassMap.entries()]
    .map(([classId, v]) => ({
      className: classById.get(classId) ?? "Unknown",
      meanMarks: Math.round((v.total / v.count) * 10) / 10,
      students: v.count,
    }))
    .sort((a, b) => b.meanMarks - a.meanMarks);

  const bySubject = [...bySubjectMap.entries()]
    .map(([subjectId, v]) => ({
      subjectName: subjectById.get(subjectId) ?? "Unknown",
      meanMarks: Math.round((v.total / v.count) * 10) / 10,
    }))
    .sort((a, b) => b.meanMarks - a.meanMarks)
    .slice(0, 8);

  const topStudents = [...byStudentMap.entries()]
    .map(([studentId, v]) => {
      const student = studentById.get(studentId);
      return {
        studentId,
        name: student ? `${student.firstName} ${student.lastName}` : "Unknown",
        admNo: student?.admNo ?? "",
        className: classById.get(v.classId) ?? "Unknown",
        meanMarks: Math.round((v.total / v.count) * 10) / 10,
      };
    })
    .sort((a, b) => b.meanMarks - a.meanMarks)
    .slice(0, 5);

  return {
    examCount: sortedExams.length,
    latestExamName: latestExam?.name ?? null,
    examTrend,
    byClass,
    bySubject,
    topStudents,
  };
}

async function attendanceAnalytics(ctx: QueryCtx, schoolId: Id<"schools">, dateFrom?: number) {
  // OPTIMIZATION: Don't fetch all students here — the dashboard already
  // provides the student count via getDashboardStats. Use a small sample
  // to estimate expectedStudents, or accept 0 when not provided.
  const classes = await ctx.db
    .query("classes")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(500);

  const classById = new Map(classes.map((c) => [c._id, c.name]));
  const now = Date.now();
  const dayOf = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  // OPTIMIZED: Query today's records using by_date index (reads ONLY today's docs)
  const today = dayOf(now);
  const endOfDay = today + DAY - 1;
  const todayRecords = await ctx.db
    .query("attendance")
    .withIndex("by_date", (q) =>
      q.eq("schoolId", schoolId)
        .gte("date", today)
        .lte("date", endOfDay)
    )
    .take(5000);

  // OPTIMIZED: Query trend period using by_date index (reads ONLY date-range docs)
  const trendStart = dateFrom ?? (now - 13 * DAY);
  const trendDays = Math.ceil((now - trendStart) / DAY);
  const trendLimit = Math.min(trendDays, 90);
  const trendStartDay = dayOf(now - (trendLimit - 1) * DAY);
  
  const trendRecords = await ctx.db
    .query("attendance")
    .withIndex("by_date", (q) =>
      q.eq("schoolId", schoolId)
        .gte("date", trendStartDay)
        .lte("date", endOfDay)
    )
    .take(10000);

  // Build trend from queried records (no in-memory filtering needed)
  const trend: { label: string; rate: number; present: number; total: number }[] = [];
  const recordsByDay = new Map<number, typeof trendRecords>();
  for (const r of trendRecords) {
    const day = dayOf(r.date);
    if (!recordsByDay.has(day)) recordsByDay.set(day, []);
    recordsByDay.get(day)!.push(r);
  }
  
  for (let i = trendLimit - 1; i >= 0; i--) {
    const day = dayOf(now - i * DAY);
    const dayRecords = recordsByDay.get(day) ?? [];
    const present = dayRecords.filter(
      (r) => r.status === "present" || r.status === "late"
    ).length;
    trend.push({
      label: new Date(day).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      rate:
        dayRecords.length > 0
          ? Math.round((present / dayRecords.length) * 100)
          : 0,
      present,
      total: dayRecords.length,
    });
  }

  // Per-class rate over the range (default 30 days).
  // OPTIMIZED: Use trendRecords already fetched (covers up to 90 days)
  const classWindowStart = dateFrom ?? (now - 30 * DAY);
  const classRecords = trendRecords.filter((r) => r.date >= classWindowStart);
  const classMap = new Map<Id<"classes">, { present: number; total: number }>();
  for (const r of classRecords) {
    const entry = classMap.get(r.classId) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (r.status === "present" || r.status === "late") entry.present += 1;
    classMap.set(r.classId, entry);
  }
  const byClass = [...classMap.entries()]
    .map(([classId, v]) => ({
      className: classById.get(classId) ?? "Unknown",
      rate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
      total: v.total,
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => a.rate - b.rate);

  // Today's breakdown (from already-fetched todayRecords)
  const statusCount = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of todayRecords) {
    if (r.status in statusCount) statusCount[r.status as keyof typeof statusCount] += 1;
  }
  const presentToday = statusCount.present + statusCount.late;

  return {
    trend,
    byClass,
    today: {
      ...statusCount,
      total: todayRecords.length,
      rate:
        todayRecords.length > 0
          ? Math.round((presentToday / todayRecords.length) * 100)
          : 0,
      expectedStudents: 0, // caller provides from getDashboardStats if needed
    },
  };
}

// ── Fee analytics (leadership only) ────────────────────────────────

export const getFeeAnalytics = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { schoolId, termId }) => {
    await requireActiveMembership(ctx, schoolId);
    await requirePrincipal(ctx, schoolId);
    return feeAnalytics(ctx, schoolId, termId);
  },
});

// ── Academic analytics (any school member) ─────────────────────────

export const getAcademicAnalytics = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { schoolId, termId }) => {
    await requireActiveMembership(ctx, schoolId);
    return academicAnalytics(ctx, schoolId, termId);
  },
});

// ── Attendance analytics (any school member) ───────────────────────

export const getAttendanceAnalytics = query({
  args: {
    schoolId: v.id("schools"),
    dateFrom: v.optional(v.number()),
  },
  handler: async (ctx, { schoolId, dateFrom }) => {
    await requireActiveMembership(ctx, schoolId);
    return attendanceAnalytics(ctx, schoolId, dateFrom);
  },
});

// ── Bundled, role-aware dashboard analytics (with lazy cache) ───

/** The actual computation, extracted so it can be called from the cache path. */
async function enrollmentAnalytics(ctx: QueryCtx, schoolId: Id<"schools">) {
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(50);

    // Sort terms chronologically
    const sortedTerms = [...terms].sort((a, b) => a.startDate - b.startDate);

    // Fetch all enrollments for this school
    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    // Group enrollments by term
    const enrollmentsByTerm = new Map<string, { active: number; graduated: number; withdrawn: number; suspended: number; total: number }>();
    for (const e of enrollments) {
      const termId = e.termId as string;
      if (!enrollmentsByTerm.has(termId)) {
        enrollmentsByTerm.set(termId, { active: 0, graduated: 0, withdrawn: 0, suspended: 0, total: 0 });
      }
      const bucket = enrollmentsByTerm.get(termId)!;
      bucket[e.status]++;
      bucket.total++;
    }

    // Build trend data
    const trend = sortedTerms.map((t) => {
      const data = enrollmentsByTerm.get(t._id as string);
      return {
        termId: t._id,
        label: `${t.name} ${t.year}`,
        active: data?.active ?? 0,
        graduated: data?.graduated ?? 0,
        withdrawn: data?.withdrawn ?? 0,
        suspended: data?.suspended ?? 0,
        total: data?.total ?? 0,
      };
    });

    // Summary stats
    const totalEnrolled = enrollments.length;
    const activeCount = enrollments.filter((e) => e.status === "active").length;
    const withdrawnCount = enrollments.filter((e) => e.status === "withdrawn").length;
    const graduatedCount = enrollments.filter((e) => e.status === "graduated").length;
    const currentTerm = terms.find((t) => t.status === "active");
    const currentTermEnrollments = currentTerm
      ? enrollments.filter((e) => e.termId === currentTerm._id)
      : [];
    const currentActive = currentTermEnrollments.filter((e) => e.status === "active").length;

    return {
      trend,
      summary: {
        totalEnrolled,
        activeCount,
        withdrawnCount,
        graduatedCount,
        currentTermActive: currentActive,
        currentTermName: currentTerm ? `${currentTerm.name} ${currentTerm.year}` : null,
      },
    };
  }

  async function computeDashboardAnalytics(ctx: QueryCtx, schoolId: Id<"schools">, termId?: Id<"terms">): Promise<any> {
    const role = await resolveRole(ctx, schoolId);
    const isLeadership = await isLeadershipRoleKey(ctx, schoolId, role);

    const [finance, academic, attendance, enrollment] = await Promise.all([
      // Finance is leadership-only; skip entirely otherwise.
      isLeadership ? feeAnalytics(ctx, schoolId, termId) : Promise.resolve(null),
      academicAnalytics(ctx, schoolId, termId),
      attendanceAnalytics(ctx, schoolId),
      enrollmentAnalytics(ctx, schoolId),
    ]);

    return { role, isLeadership, finance, academic, attendance, enrollment };
  }

export const getDashboardAnalytics = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { schoolId, termId }) => {
    await requireActiveMembership(ctx, schoolId);

    // ── Read-through cache: read directly from DB (avoids ctx.runQuery circular types) ──
    const cacheEntry = await ctx.db
      .query("dashboard_cache")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (cacheEntry && (Date.now() - cacheEntry.computedAt) < CACHE_TTL_MS && cacheEntry.analytics) {
      return cacheEntry.analytics;
    }

    // ── Cache miss — compute live (cron job will refresh cache) ────
    return computeDashboardAnalytics(ctx, schoolId, termId);
  },
});
