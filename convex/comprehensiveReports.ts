import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireActiveMembership } from "./helpers";
import { loadStudentEavValues } from "./studentEavLookup";

/**
 * Comprehensive School Report — pulls data from ALL phases
 * Returns aggregated stats and details for the principal dashboard.
 */

// ── Main Report Query ─────────────────────────────────────────────
export const getSchoolOverview = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    // P0: tenant isolation — this previously had NO auth gate and let any
    // logged-in user read any school's full data.
    await requireActiveMembership(ctx, schoolId);

    // ── Core Entities ─────────────────────────────────────────────
    const [
      classes,
      students,
      teachers,
      books,
      subjects,
      terms,
      academicYears,
    ] = await Promise.all([
      ctx.db.query("classes").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("students").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("teachers").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("books").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("subjects").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(200),
      ctx.db.query("terms").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(100),
      ctx.db.query("academicYears").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(50),
    ]);

    // Phase 18: gender is a school-defined EAV field — join it for the split.
    const genderByStudent = await loadStudentEavValues(ctx, schoolId, ["gender"]);

    // ── Current Term ──────────────────────────────────────────────
    const currentTerm = terms.find((t) => t.status === "active") ?? terms.find((t) => t.isCurrent);

    // ── Phase 2: Learner Bucket ──────────────────────────────────
    const [
      healthRecords,
      clinicVisits,
      disciplineIncidents,
      promotionHistory,
      extracurricularActivities,
      studentActivities,
    ] = await Promise.all([
      ctx.db.query("health_records").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("clinic_visits").withIndex("by_schoolId_date", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("discipline_incidents").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("promotion_history").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("extracurricular_activities").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(200),
      ctx.db.query("student_activities").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
    ]);

    // ── Phase 3: Teaching Staff Bucket ────────────────────────────
    const [
      schemesOfWork,
      lessonPlans,
      dutyRosterEntries,
      staffAttendance,
      leaveRequests,
      appraisals,
      parentMeetings,
    ] = await Promise.all([
      ctx.db.query("schemes_of_work").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("lesson_plans").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("duty_roster_entries").withIndex("by_schoolId_date", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("staff_attendance").withIndex("by_schoolId_date", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("leave_requests").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("appraisals").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("parent_meetings").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
    ]);

    // ── Phase 4: Non-Teaching Staff Bucket ───────────────────────
    // OPTIMIZATION: Reduced limits from 5000 to 2000 for high-volume tables
    const [
      medicalSupplies,
      vaccinationRecords,
      transportRoutes,
      routeLogs,
      vehicleMaintenance,
      visitorLog,
      gateStudentLog,
      maintenanceTasks,
    ] = await Promise.all([
      ctx.db.query("medical_supplies").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("vaccination_records").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("transport_routes").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(100),
      ctx.db.query("route_logs").withIndex("by_schoolId_date", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("vehicle_maintenance").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("visitor_log").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("gate_student_log").withIndex("by_schoolId_date", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("maintenance_tasks").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
    ]);

    // ── Phase 5: Admin Staff Bucket ──────────────────────────────
    const [
      admissionApplications,
      expenditures,
      budgets,
      supplierPayments,
      correspondence,
      appointments,
    ] = await Promise.all([
      ctx.db.query("admission_applications").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("expenditures").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("budgets").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("supplier_payments").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("correspondence").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("appointments").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
    ]);

    // ── Library ───────────────────────────────────────────────────
    const [borrowings, fines, finePayments] = await Promise.all([
      ctx.db.query("borrowings").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("fines").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
      ctx.db.query("fine_payments").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
    ]);

    // ── Exams & Attendance ────────────────────────────────────────
    const [exams, examResults, attendance] = await Promise.all([
      ctx.db.query("exams").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("exam_results").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("attendance").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
    ]);

    // ── School Fees ───────────────────────────────────────────────
    const [feeStructures, feePayments] = await Promise.all([
      ctx.db.query("fee_structures").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("fee_payments").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(2000),
    ]);

    // ══════════════════════════════════════════════════════════════
    // AGGREGATE STATS
    // ══════════════════════════════════════════════════════════════

    // ── Student Stats ─────────────────────────────────────────────
    const activeStudents = students.filter((s) => !s.status || s.status === "active");
    const studentsByClass = classes.map((c) => ({
      className: c.name,
      count: students.filter((s) => s.classId === c._id).length,
    }));
    const genderSplit = {
      male: activeStudents.filter((s) => genderByStudent.get(s._id)?.gender === "male").length,
      female: activeStudents.filter((s) => genderByStudent.get(s._id)?.gender === "female").length,
      other: activeStudents.filter((s) => genderByStudent.get(s._id)?.gender === "other").length,
      unspecified: activeStudents.filter((s) => !genderByStudent.get(s._id)?.gender).length,
    };

    // ── Attendance Stats (last 30 days) ───────────────────────────
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentAttendance = attendance.filter((a) => a.date >= thirtyDaysAgo);
    const attendanceStats = {
      present: recentAttendance.filter((a) => a.status === "present").length,
      absent: recentAttendance.filter((a) => a.status === "absent").length,
      late: recentAttendance.filter((a) => a.status === "late").length,
      excused: recentAttendance.filter((a) => a.status === "excused").length,
      total: recentAttendance.length,
      rate: recentAttendance.length > 0
        ? Math.round((recentAttendance.filter((a) => a.status === "present").length / recentAttendance.length) * 100)
        : 0,
    };

    // ── Staff Attendance (last 30 days) ───────────────────────────
    const recentStaffAttendance = staffAttendance.filter((a) => a.date >= thirtyDaysAgo);
    const staffAttendanceStats = {
      present: recentStaffAttendance.filter((a) => a.status === "present").length,
      absent: recentStaffAttendance.filter((a) => a.status === "absent").length,
      late: recentStaffAttendance.filter((a) => a.status === "late").length,
      total: recentStaffAttendance.length,
      rate: recentStaffAttendance.length > 0
        ? Math.round((recentStaffAttendance.filter((a) => a.status === "present").length / recentStaffAttendance.length) * 100)
        : 0,
    };

    // ── Discipline Stats ──────────────────────────────────────────
    const disciplineStats = {
      total: disciplineIncidents.length,
      open: disciplineIncidents.filter((d) => d.resolutionStatus === "open").length,
      investigating: disciplineIncidents.filter((d) => d.resolutionStatus === "investigating").length,
      resolved: disciplineIncidents.filter((d) => d.resolutionStatus === "resolved").length,
      escalated: disciplineIncidents.filter((d) => d.resolutionStatus === "escalated").length,
      recentIncidents: disciplineIncidents
        .sort((a, b) => b.date - a.date)
        .slice(0, 5)
        .map((d) => ({
          _id: d._id,
          category: d.category,
          description: d.description,
          date: d.date,
          resolutionStatus: d.resolutionStatus,
        })),
    };

    // ── Health Stats ──────────────────────────────────────────────
    const healthStats = {
      studentsWithRecords: healthRecords.length,
      clinicVisitsTotal: clinicVisits.length,
      recentClinicVisits: clinicVisits
        .sort((a, b) => b.date - a.date)
        .slice(0, 5)
        .map((v) => ({
          _id: v._id,
          reason: v.reason,
          action: v.action,
          date: v.date,
        })),
      vaccinationsTotal: vaccinationRecords.length,
    };

    // ── Library Stats ─────────────────────────────────────────────
    const activeBorrowings = borrowings.filter((b) => b.status === "borrowed");
    const overdueBorrowings = activeBorrowings.filter((b) => b.dueDate < Date.now());
    const totalFines = fines.reduce((sum, f) => sum + f.amount, 0);
    const unpaidFines = fines
      .filter((f) => f.status === "unpaid")
      .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

    // ── Financial Stats ───────────────────────────────────────────
    const totalExpenditure = expenditures.reduce((sum, e) => sum + e.amount, 0);
    const totalFeeCollected = feePayments.reduce((sum, p) => sum + p.amount, 0);
    const totalBudgetAllocated = budgets.reduce((sum, b) => sum + b.allocatedAmount, 0);
    const totalBudgetSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0);

    const expenditureByCategory: Record<string, number> = {};
    for (const exp of expenditures) {
      expenditureByCategory[exp.category] = (expenditureByCategory[exp.category] || 0) + exp.amount;
    }

    // ── Admissions Stats ──────────────────────────────────────────
    const admissionStats = {
      total: admissionApplications.length,
      pending: admissionApplications.filter((a) => a.status === "pending").length,
      underReview: admissionApplications.filter((a) => a.status === "under_review").length,
      accepted: admissionApplications.filter((a) => a.status === "accepted").length,
      rejected: admissionApplications.filter((a) => a.status === "rejected").length,
    };

    // ── HR Stats ──────────────────────────────────────────────────
    const pendingLeaves = leaveRequests.filter((l) => l.status === "pending");
    const activeDutyToday = dutyRosterEntries.filter(
      (d) => new Date(d.date).toDateString() === new Date().toDateString()
    );

    // ── Maintenance Stats ─────────────────────────────────────────
    const maintenanceStats = {
      total: maintenanceTasks.length,
      pending: maintenanceTasks.filter((m) => m.status === "pending").length,
      inProgress: maintenanceTasks.filter((m) => m.status === "in_progress").length,
      completed: maintenanceTasks.filter((m) => m.status === "completed").length,
      urgent: maintenanceTasks.filter((m) => m.priority === "urgent").length,
    };

    // ── Correspondence Stats ──────────────────────────────────────
    const correspondenceStats = {
      total: correspondence.length,
      incoming: correspondence.filter((c) => c.direction === "incoming").length,
      outgoing: correspondence.filter((c) => c.direction === "outgoing").length,
      pendingAction: correspondence.filter((c) => c.status === "pending_action").length,
    };

    // ── Transport Stats ───────────────────────────────────────────
    const transportStats = {
      activeRoutes: transportRoutes.filter((r) => r.isActive).length,
      totalRoutes: transportRoutes.length,
      todayLogs: routeLogs.filter(
        (l) => new Date(l.date).toDateString() === new Date().toDateString()
      ).length,
      pendingMaintenance: vehicleMaintenance.filter((m) => {
        if (!m.nextServiceDate) return false;
        return m.nextServiceDate <= Date.now() + 7 * 24 * 60 * 60 * 1000;
      }).length,
    };

    // ── Visitor Stats (today) ─────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayVisitors = visitorLog.filter((v) => v.checkInTime >= todayStart.getTime());

    // ── Extracurricular Stats ─────────────────────────────────────
    const extracurricularStats = {
      totalActivities: extracurricularActivities.length,
      totalParticipations: studentActivities.length,
      activeParticipations: studentActivities.filter((a) => a.status === "active").length,
    };

    // ── Academic Performance (if exams exist) ────────────────────
    const examStats = {
      totalExams: exams.length,
      totalResults: examResults.length,
      averageScore: examResults.length > 0
        ? Math.round(examResults.reduce((sum, r) => sum + r.marks, 0) / examResults.length)
        : 0,
    };

    // ── Supplier Payments ─────────────────────────────────────────
    const supplierPaymentStats = {
      total: supplierPayments.length,
      pending: supplierPayments.filter((s) => s.status === "pending").length,
      paid: supplierPayments.filter((s) => s.status === "paid").length,
      overdue: supplierPayments.filter((s) => s.status === "overdue").length,
      totalOwed: supplierPayments
        .filter((s) => s.status !== "paid")
        .reduce((sum, s) => sum + (s.amount - s.paidAmount), 0),
    };

    // ══════════════════════════════════════════════════════════════
    // RETURN COMPREHENSIVE REPORT
    // ══════════════════════════════════════════════════════════════

    return {
      // ── Overview ────────────────────────────────────────────────
      overview: {
        totalClasses: classes.length,
        totalStudents: activeStudents.length,
        totalTeachers: teachers.length,
        totalBooks: books.length,
        totalSubjects: subjects.length,
        currentTerm: currentTerm?.name ?? "None",
        currentAcademicYear: academicYears.find((y) => y.status === "active")?.label ?? "None",
      },

      // ── Students ────────────────────────────────────────────────
      students: {
        total: activeStudents.length,
        byClass: studentsByClass,
        gender: genderSplit,
        byStatus: {
          active: activeStudents.length,
          graduated: students.filter((s) => s.status === "graduated").length,
          withdrawn: students.filter((s) => s.status === "withdrawn").length,
          suspended: students.filter((s) => s.status === "suspended").length,
        },
      },

      // ── Attendance ──────────────────────────────────────────────
      attendance: attendanceStats,

      // ── Staff ───────────────────────────────────────────────────
      staff: {
        total: teachers.length,
        attendance: staffAttendanceStats,
        pendingLeaves: pendingLeaves.length,
        pendingLeaveDetails: pendingLeaves.slice(0, 5).map((l) => ({
          _id: l._id,
          teacherId: l.teacherId,
          leaveType: l.leaveType,
          startDate: l.startDate,
          endDate: l.endDate,
          reason: l.reason,
        })),
        dutyToday: activeDutyToday.length,
        appraisalsTotal: appraisals.length,
        parentMeetingsTotal: parentMeetings.length,
      },

      // ── Discipline ──────────────────────────────────────────────
      discipline: disciplineStats,

      // ── Health ──────────────────────────────────────────────────
      health: healthStats,

      // ── Library ─────────────────────────────────────────────────
      library: {
        totalBooks: books.length,
        activeBorrowings: activeBorrowings.length,
        overdueBorrowings: overdueBorrowings.length,
        totalFines,
        unpaidFines,
        recentBorrowings: borrowings
          .sort((a, b) => b.borrowedAt - a.borrowedAt)
          .slice(0, 5)
          .map((b) => ({
            _id: b._id,
            bookName: b.bookName,
            borrowedAt: b.borrowedAt,
            dueDate: b.dueDate,
            status: b.status,
          })),
      },

      // ── Financial ───────────────────────────────────────────────
      financial: {
        totalFeeCollected,
        totalExpenditure,
        netIncome: totalFeeCollected - totalExpenditure,
        budgetAllocated: totalBudgetAllocated,
        budgetSpent: totalBudgetSpent,
        expenditureByCategory,
        supplierPayments: supplierPaymentStats,
        feeStructures: feeStructures.length,
      },

      // ── Admissions ──────────────────────────────────────────────
      admissions: admissionStats,

      // ── Maintenance ─────────────────────────────────────────────
      maintenance: maintenanceStats,

      // ── Correspondence ──────────────────────────────────────────
      correspondence: correspondenceStats,

      // ── Transport ───────────────────────────────────────────────
      transport: transportStats,

      // ── Visitors ────────────────────────────────────────────────
      visitors: {
        today: todayVisitors.length,
        total: visitorLog.length,
        recentVisitors: todayVisitors.slice(0, 5).map((v) => ({
          _id: v._id,
          visitorName: v.visitorName,
          purpose: v.purpose,
          checkInTime: v.checkInTime,
          checkOutTime: v.checkOutTime,
        })),
      },

      // ── Extracurricular ─────────────────────────────────────────
      extracurricular: extracurricularStats,

      // ── Academic Performance ────────────────────────────────────
      academics: {
        exams: examStats,
        lessonPlans: lessonPlans.length,
        schemesOfWork: schemesOfWork.length,
      },

      // ── Appointments ────────────────────────────────────────────
      appointments: {
        total: appointments.length,
        scheduled: appointments.filter((a) => a.status === "scheduled").length,
        today: appointments.filter(
          (a) =>
            a.status === "scheduled" &&
            new Date(a.date).toDateString() === new Date().toDateString()
        ).length,
        upcoming: appointments
          .filter((a) => a.status === "scheduled" && a.date >= Date.now())
          .sort((a, b) => a.date - b.date)
          .slice(0, 5)
          .map((a) => ({
            _id: a._id,
            title: a.title,
            date: a.date,
            startTime: a.startTime,
            endTime: a.endTime,
            withPerson: a.withPerson,
          })),
      },
    };
  },
});

// ── Term Comparison Report ─────────────────────────────────────────
export const getTermComparison = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireActiveMembership(ctx, schoolId);
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(4);

    const termStats = await Promise.all(
      terms.map(async (term) => {
        const [attendance, examResults, feePayments, disciplineIncidents] = await Promise.all([
          ctx.db.query("attendance").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
          ctx.db.query("exam_results").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(10000),
          ctx.db.query("fee_payments").withIndex("by_term", (q) => q.eq("schoolId", schoolId).eq("termId", term._id)).take(5000),
          ctx.db.query("discipline_incidents").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
        ]);

        // Filter by term date range
        const termAttendance = attendance.filter(
          (a) => a.date >= term.startDate && a.date <= term.endDate
        );
        const termResults = examResults; // Results are linked to exams which have termId
        const termDiscipline = disciplineIncidents.filter(
          (d) => d.date >= term.startDate && d.date <= term.endDate
        );

        const totalFee = feePayments.reduce((sum, p) => sum + p.amount, 0);

        return {
          termId: term._id,
          termName: term.name,
          attendance: {
            total: termAttendance.length,
            present: termAttendance.filter((a) => a.status === "present").length,
            rate: termAttendance.length > 0
              ? Math.round((termAttendance.filter((a) => a.status === "present").length / termAttendance.length) * 100)
              : 0,
          },
          fees: {
            collected: totalFee,
            paymentCount: feePayments.length,
          },
          discipline: {
            incidents: termDiscipline.length,
            resolved: termDiscipline.filter((d) => d.resolutionStatus === "resolved").length,
          },
          exams: {
            resultsCount: termResults.length,
            averageScore: termResults.length > 0
              ? Math.round(termResults.reduce((sum, r) => sum + r.marks, 0) / termResults.length)
              : 0,
          },
        };
      })
    );

    return termStats;
  },
});

// ── Class Performance Report ───────────────────────────────────────
export const getClassPerformance = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
  },
  handler: async (ctx, { schoolId, termId }) => {
    await requireActiveMembership(ctx, schoolId);
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const examResults = await ctx.db
      .query("exam_results")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(10000);

    // Filter exams by term if specified
    const filteredExams = termId
      ? exams.filter((e) => e.termId === termId)
      : exams;

    const examIds = new Set(filteredExams.map((e) => e._id));

    const classPerformance = classes.map((cls) => {
      const classStudents = students.filter((s) => s.classId === cls._id);
      const classResults = examResults.filter(
        (r) => classStudents.some((s) => s._id === r.studentId) && examIds.has(r.examId)
      );

      const averageScore =
        classResults.length > 0
          ? Math.round(classResults.reduce((sum, r) => sum + r.marks, 0) / classResults.length)
          : 0;

      const gradeDistribution: Record<string, number> = {};
      for (const r of classResults) {
        if (r.grade) {
          gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
        }
      }

      return {
        className: cls.name,
        studentCount: classStudents.length,
        examResultsCount: classResults.length,
        averageScore,
        gradeDistribution,
      };
    });

    return classPerformance;
  },
});
