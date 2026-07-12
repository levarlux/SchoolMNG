import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  requireSchoolMembership,
  requireStudentMembership,
} from "./helpers";

// ── Report queries ─────────────────────────────────────────────────
// These return structured data for client-side CSV/PDF export.

export const classList = query({
  args: {
    schoolId: v.id("schools"),
    classId: v.id("classes"),
  },
  handler: async (ctx, { schoolId, classId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const cls = await ctx.db.get(classId);
    if (!cls || cls.schoolId !== schoolId) throw new Error("Class not found");

    const students = await ctx.db
      .query("students")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(1000);

    const streams = await ctx.db
      .query("streams")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(100);

    const streamMap = new Map(streams.map((s) => [s._id, s.name]));

    return {
      className: cls.name,
      students: students.map((s) => ({
        firstName: s.firstName,
        lastName: s.lastName,
        admNo: s.admNo,
        stream: s.streamId ? streamMap.get(s.streamId) ?? "" : "",
      })),
    };
  },
});

export const studentList = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);

    const classMap = new Map(classes.map((c) => [c._id, c.name]));

    return students.map((s) => ({
      firstName: s.firstName,
      lastName: s.lastName,
      admNo: s.admNo,
      class: classMap.get(s.classId) ?? "",
    }));
  },
});

export const borrowingRecords = query({
  args: {
    schoolId: v.id("schools"),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, { schoolId, startDate, endDate }) => {
    await requireSchoolMembership(ctx, schoolId);

    const borrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const studentMap = new Map(
      students.map((s) => [s._id, `${s.firstName} ${s.lastName}`])
    );

    let filtered = borrowings;
    if (startDate) filtered = filtered.filter((b) => b.borrowedAt >= startDate);
    if (endDate) filtered = filtered.filter((b) => b.borrowedAt <= endDate);

    return filtered.map((b) => ({
      studentName: studentMap.get(b.studentId) ?? "Unknown",
      bookName: b.bookName,
      bookNumber: b.bookNumber,
      borrowedAt: new Date(b.borrowedAt).toISOString(),
      dueDate: new Date(b.dueDate).toISOString(),
      returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : "",
      status: b.status,
    }));
  },
});

export const overdueReport = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);

    const active = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", schoolId).eq("status", "borrowed"))
      .take(5000);

    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    const studentMap = new Map(
      students.map((s) => [s._id, `${s.firstName} ${s.lastName}`])
    );

    const now = Date.now();
    const overdue = active.filter((b) => b.dueDate < now);

    return overdue.map((b) => ({
      studentName: studentMap.get(b.studentId) ?? "Unknown",
      bookName: b.bookName,
      bookNumber: b.bookNumber,
      borrowedAt: new Date(b.borrowedAt).toISOString(),
      dueDate: new Date(b.dueDate).toISOString(),
      daysOverdue: Math.floor((now - b.dueDate) / (1000 * 60 * 60 * 24)),
    }));
  },
});

export const usageReport = query({
  args: {
    schoolId: v.id("schools"),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
  },
  handler: async (ctx, { schoolId, startDate, endDate }) => {
    await requireSchoolMembership(ctx, schoolId);

    const allBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(5000);

    let borrowings = allBorrowings;
    if (startDate) borrowings = borrowings.filter((b) => b.borrowedAt >= startDate);
    if (endDate) borrowings = borrowings.filter((b) => b.borrowedAt <= endDate);

    const totalBorrowings = borrowings.length;
    const totalReturned = borrowings.filter((b) => b.status === "returned").length;
    const totalOverdue = borrowings.filter(
      (b) => b.dueDate < Date.now() && b.status === "borrowed"
    ).length;

    // Top books
    const bookCounts = new Map<string, { count: number; name: string }>();
    for (const b of borrowings) {
      const existing = bookCounts.get(b.bookNumber);
      if (existing) {
        existing.count++;
      } else {
        bookCounts.set(b.bookNumber, { count: 1, name: b.bookName });
      }
    }
    const topBooks = [...bookCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([bookNumber, data]) => ({
        bookNumber,
        bookName: data.name,
        borrowCount: data.count,
      }));

    return {
      totalBorrowings,
      totalReturned,
      totalOverdue,
      returnRate: totalBorrowings > 0
        ? Math.round((totalReturned / totalBorrowings) * 100)
        : 0,
      topBooks,
    };
  },
});

export const readingLog = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, { studentId }) => {
    await requireStudentMembership(ctx, studentId);
    const student = await ctx.db.get(studentId);

    const borrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .order("desc")
      .take(500);

    return {
      student: student
        ? { firstName: student.firstName, lastName: student.lastName, admNo: student.admNo }
        : null,
      history: borrowings.map((b) => ({
        bookName: b.bookName,
        bookNumber: b.bookNumber,
        borrowedAt: new Date(b.borrowedAt).toISOString(),
        dueDate: new Date(b.dueDate).toISOString(),
        returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : "",
        status: b.status,
      })),
    };
  },
});

export const fullSchoolExport = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);

    const [classes, students, books, borrowings] = await Promise.all([
      ctx.db.query("classes").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(500),
      ctx.db.query("students").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("books").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
      ctx.db.query("borrowings").withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId)).take(5000),
    ]);

    // Fetch all streams for all classes
    const allStreams: { _id: any; name: string; classId: any }[] = [];
    for (const cls of classes) {
      const classStreams = await ctx.db
        .query("streams")
        .withIndex("by_classId", (q) => q.eq("classId", cls._id))
        .take(100);
      allStreams.push(...classStreams);
    }

    const classMap = new Map(classes.map((c) => [c._id, c.name]));
    const studentMap = new Map(students.map((s) => [s._id, `${s.firstName} ${s.lastName}`]));

    return {
      classes: classes.map((c) => ({ name: c.name, hasStreams: c.hasStreams })),
      students: students.map((s) => ({
        firstName: s.firstName,
        lastName: s.lastName,
        admNo: s.admNo,
        class: classMap.get(s.classId) ?? "",
      })),
      books: books.map((b) => ({
        title: b.title,
        author: b.author,
        availableCopies: b.availableCopies,
        totalCopies: b.totalCopies ?? "",
        isbn: b.isbn ?? "",
        subject: b.subject ?? "",
      })),
      borrowings: borrowings.map((b) => ({
        studentName: studentMap.get(b.studentId) ?? "Unknown",
        bookName: b.bookName,
        bookNumber: b.bookNumber,
        borrowedAt: new Date(b.borrowedAt).toISOString(),
        dueDate: new Date(b.dueDate).toISOString(),
        returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : "",
        status: b.status,
      })),
    };
  },
});
