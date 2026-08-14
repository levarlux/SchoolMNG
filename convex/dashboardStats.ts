import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActiveMembership } from "./helpers";
import { Doc } from "./_generated/dataModel";

/**
 * Dashboard Stats — aggregated stats from all modules for the home dashboard.
 * Library-related data is intentionally omitted so schools that don't use
 * the library module can see a clean KPI grid. Expenditure data is included
 * instead.
 */

/** Get all dashboard stats in one call */
export const getDashboardStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    // P0: tenant isolation + active-status gate.
    await requireActiveMembership(ctx, schoolId);
    
    const DAY = 86_400_000;
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();
    const endOfDay = todayTs + DAY - 1;

    // ── Student count: deferred to studentsPerClass fetch below ──────
    // (avoids a redundant 5000-doc query)
    let totalStudentsCount = 0;

    // ── Academics ──────────────────────────────────────────────
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const teachers = await ctx.db
      .query("teachers")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const subjects = await ctx.db
      .query("subjects")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200);

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200);

    // ── Library ────────────────────────────────────────────────
    // Fines: use by_status to only get unpaid fines (capped small)
    const unpaidFines = await ctx.db
      .query("fines")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "unpaid"))
      .take(200);

    const totalUnpaidFines = unpaidFines.reduce((s, f) => s + (f.amount - f.paidAmount), 0);

    // ── Finance ────────────────────────────────────────────────
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(50);

    const currentTerm = terms.find((t) => t.status === "active") ?? terms[0];

    let feeSummary = { expected: 0, collected: 0, outstanding: 0, collectionRate: 0, debtors: 0, studentCount: 0, paymentCount: 0 };
    if (currentTerm) {
      const termPayments = await ctx.db
        .query("fee_payments")
        .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", currentTerm._id))
        .take(2000);

      const termStructures = await ctx.db
        .query("fee_structures")
        .withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", currentTerm._id))
        .take(200);
      
      // OPTIMIZATION: Only fetch students for classes that have a fee structure this term
      const classesWithFees = new Set(termStructures.map(s => s.classId));
      const studentsWithFees: Doc<"students">[] = [];
      for (const cid of classesWithFees) {
        const classStudents = await ctx.db
          .query("students")
          .withIndex("by_classId", q => q.eq("classId", cid))
          .collect();
        studentsWithFees.push(...classStudents.filter(s => s.schoolId === schoolId));
      }

      const totalExpected = termStructures.reduce((s, st) => s + st.amount * studentsWithFees.filter((st2) => st2.classId === st.classId).length, 0);
      const totalCollected = termPayments.reduce((s, p) => s + p.amount, 0);

      // Simple debtor count
      const studentPaidMap = new Map<string, number>();
      for (const p of termPayments) {
        studentPaidMap.set(p.studentId, (studentPaidMap.get(p.studentId) ?? 0) + p.amount);
      }
      const debtors = studentsWithFees.filter((s) => {
        const paid = studentPaidMap.get(s._id) ?? 0;
        return paid < (termStructures.find((st) => st.classId === s.classId)?.amount ?? 0);
      }).length;

      feeSummary = {
        expected: totalExpected,
        collected: totalCollected,
        outstanding: totalExpected - totalCollected,
        collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
        debtors,
        studentCount: studentsWithFees.length,
        paymentCount: termPayments.length,
      };
    }

    const expenditures = await ctx.db
      .query("expenditures")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const totalExpenditures = expenditures.reduce((s, e) => s + e.amount, 0);

    // ── Attendance (today) - OPTIMIZED: use by_date index ─────────────
    const todayRecords = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) =>
        q.eq("schoolId", schoolId)
          .gte("date", todayTs)
          .lte("date", endOfDay)
      )
      .collect();

    const presentToday = todayRecords.filter((r) => r.status === "present" || r.status === "late").length;
    const attendanceRate = totalStudentsCount > 0 ? Math.round((presentToday / totalStudentsCount) * 100) : 0;

    // ── Health ─────────────────────────────────────────────────
    // Clinic visits: use date-bounded index to only fetch recent docs
    const recentClinicVisits = await ctx.db
      .query("clinic_visits")
      .withIndex("by_schoolId_date", (q) => 
        q.eq("schoolId", schoolId)
         .gte("date", now - 7 * DAY)
      )
      .take(200);

    const clinicVisitsLength = recentClinicVisits.length;

    // ── Discipline ─────────────────────────────────────────────
    // Use by_status index to fetch ONLY open incidents (avoids reading all)
    const openIncidents = await ctx.db
      .query("discipline_incidents")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("resolutionStatus", "open"))
      .take(100);
    // Total incidents — cap at 500 for dashboard display
    const disciplineIncidentsCount = (
      await ctx.db
        .query("discipline_incidents")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(500)
    ).length;

    // ── Admissions ─────────────────────────────────────────────
    // Use by_status index to fetch ONLY pending admissions
    const pendingAdmissions = await ctx.db
      .query("admission_applications")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "pending"))
      .take(100);
    const admissionsTotal = (
      await ctx.db
        .query("admission_applications")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(200)
    ).length;

    // ── Staff ──────────────────────────────────────────────────
    // Use by_schoolId_date index for today's staff attendance (bounded)
    const staffAttendanceToday = await ctx.db
      .query("staff_attendance")
      .withIndex("by_schoolId_date", (q) =>
        q.eq("schoolId", schoolId)
          .gte("date", todayTs)
          .lte("date", endOfDay)
      )
      .collect();

    const staffPresentToday = staffAttendanceToday.filter((a) => a.status === "present").length;

    // Use by_status index to fetch ONLY pending leaves
    const pendingLeaves = await ctx.db
      .query("leave_requests")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "pending"))
      .take(100);

    // ── Notifications ──────────────────────────────────────────
    // Use by_schoolId_status index to fetch ONLY unread notifications
    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_schoolId_status", (q) => q.eq("schoolId", schoolId).eq("status", "unread"))
      .take(100);

    // ── Guardians ──────────────────────────────────────────────
    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    // ── Compliance ─────────────────────────────────────────────
    // Use by_status index to fetch ONLY expired docs
    const expiredDocs = await ctx.db
      .query("compliance_documents")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "expired"))
      .take(50);
    const complianceTotal = (
      await ctx.db
        .query("compliance_documents")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(100)
    ).length;

    // ── Announcements ──────────────────────────────────────────
    // Use by_published index to fetch ONLY published announcements
    const publishedAnnouncements = await ctx.db
      .query("announcements")
      .withIndex("by_published", (q) => q.eq("schoolId", schoolId).eq("isPublished", true))
      .take(100);

    // ── Transport ──────────────────────────────────────────────
    const transportRoutes = await ctx.db
      .query("transport_routes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(50);

    // ── Maintenance ────────────────────────────────────────────
    // Use by_status index to fetch ONLY pending + in_progress tasks
    const pendingMaintenance = await ctx.db
      .query("maintenance_tasks")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "pending"))
      .take(100);
    const inProgressMaintenance = await ctx.db
      .query("maintenance_tasks")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "in_progress"))
      .take(100);

    // ── Borrowings Over Time (last 7 days) ───────────────────
    // Note: borrowings table has by_status index but no date index,
    // so we must filter in-memory. Cap at 500 for safety.
    const sevenDaysAgo = now - 7 * DAY;
    const recentBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .filter((q) => q.gte(q.field("borrowedAt"), sevenDaysAgo))
      .take(500);

    const borrowingsOverTime: { date: string; borrowings: number; returns: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const borrowedCount = recentBorrowings.filter(
        (b) => b.borrowedAt >= dayStart && b.borrowedAt < dayEnd
      ).length;
      const returnedCount = recentBorrowings.filter(
        (b) => b.returnedAt && b.returnedAt >= dayStart && b.returnedAt < dayEnd
      ).length;
      borrowingsOverTime.push({ date: key, borrowings: borrowedCount, returns: returnedCount });
    }

    // ── Students Per Class ────────────────────────────────────
    // Single fetch serves both studentsPerClass AND totalStudentsCount
    const allStudents = await ctx.db.query(
      "students"
    ).withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000);
    totalStudentsCount = allStudents.length;
    const studentsPerClass = classes.map((c) => {
      const count = allStudents.filter((s) => s.classId === c._id).length;
      return { className: c.name, count };
    });
    
    // ── Assemble ───────────────────────────────────────────────
    return {
      academics: {
        students: totalStudentsCount,
        teachers: teachers.length,
        classes: classes.length,
        subjects: subjects.length,
        exams: exams.length,
        studentsPerClass,
        teacherToStudentRatio: totalStudentsCount > 0 ? `1:${Math.round(totalStudentsCount / Math.max(teachers.length, 1))}` : "N/A",
      },
      finance: feeSummary,
      expenditures: totalExpenditures,
      attendance: {
        todayPresent: presentToday,
        todayTotal: todayRecords.length,
        attendanceRate,
      },
      health: {
        clinicVisits: clinicVisitsLength,
        recentVisits: recentClinicVisits.length,
      },
      discipline: {
        total: disciplineIncidentsCount,
        open: openIncidents.length,
      },
      admissions: {
        total: admissionsTotal,
        pending: pendingAdmissions.length,
      },
      staff: {
        presentToday: staffPresentToday,
        totalTeachers: teachers.length,
        pendingLeaves: pendingLeaves.length,
      },
      notifications: {
        unread: unreadNotifications.length,
      },
      guardians: guardians.length,
      compliance: {
        total: complianceTotal,
        expired: expiredDocs.length,
      },
      announcements: publishedAnnouncements.length,
      transport: transportRoutes.length,
      maintenance: {
        total: pendingMaintenance.length + inProgressMaintenance.length, // pending+in_progress shown on dashboard
        pending: pendingMaintenance.length + inProgressMaintenance.length,
      },
      // Aggregates for charts (replaces full-list queries on client)
      borrowingsOverTime,
      studentsPerClass,
    };
  },
});
