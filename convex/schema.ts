import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  schools: defineTable({
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.string(),
    secondaryColor: v.string(),
    accentColor: v.optional(v.string()),
  }).index("by_clerkOrgId", ["clerkOrgId"])
    .index("by_slug", ["slug"]),

  classes: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    hasStreams: v.boolean(),
  }).index("by_schoolId", ["schoolId"]),

  streams: defineTable({
    schoolId: v.optional(v.id("schools")),
    classId: v.id("classes"),
    name: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_classId", ["classId"]),

  students: defineTable({
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    firstName: v.string(),
    lastName: v.string(),
    admNo: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_classId", ["classId"])
    .index("by_admNo", ["schoolId", "admNo"])
    // _creationTime is auto-appended by Convex; no need to specify it explicitly
    .searchIndex("search_name", { searchField: "firstName" }),

  borrowings: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    bookName: v.string(),
    bookNumber: v.string(),
    borrowedAt: v.float64(),
    dueDate: v.float64(),
    returnedAt: v.optional(v.float64()),
    status: v.union(v.literal("borrowed"), v.literal("returned")),
    bookId: v.optional(v.id("books")),
  }).index("by_schoolId", ["schoolId"])
    .index("by_studentId", ["studentId"])
    .index("by_status", ["schoolId", "status"]),

  books: defineTable({
    schoolId: v.id("schools"),
    title: v.string(),
    author: v.string(),
    availableCopies: v.number(),
    totalCopies: v.optional(v.number()),
    isbn: v.optional(v.string()),
    subject: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"]),

  admins: defineTable({
    userId: v.string(),
    email: v.string(),
    role: v.literal("superadmin"),
  }).index("by_userId", ["userId"]),

  subscriptions: defineTable({
    schoolId: v.id("schools"),
    planType: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("cancelled"), v.literal("past_due")),
  }).index("by_schoolId", ["schoolId"]),

  feature_configurations: defineTable({
    schoolId: v.id("schools"),
    featureName: v.string(),
    isEnabled: v.boolean(),
    config: v.any(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_feature", ["schoolId", "featureName"]),

  fines: defineTable({
    schoolId: v.id("schools"),
    borrowingId: v.id("borrowings"),
    studentId: v.id("students"),
    amount: v.number(),
    reason: v.union(v.literal("overdue"), v.literal("lost"), v.literal("damaged")),
    status: v.union(v.literal("unpaid"), v.literal("paid"), v.literal("waived")),
    paidAmount: v.number(),
    paidAt: v.optional(v.float64()),
    waivedAt: v.optional(v.float64()),
    waivedBy: v.optional(v.string()),
    createdAt: v.float64(),
    note: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_studentId", ["studentId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_borrowingId", ["borrowingId"]),

  fine_payments: defineTable({
    schoolId: v.id("schools"),
    fineId: v.id("fines"),
    amount: v.number(),
    method: v.union(v.literal("cash"), v.literal("mobile_money"), v.literal("bank_transfer"), v.literal("other")),
    receivedBy: v.string(),
    receivedAt: v.float64(),
    reference: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_fineId", ["fineId"]),

  report_logs: defineTable({
    schoolId: v.id("schools"),
    generatedBy: v.string(),
    reportType: v.string(),
    generatedAt: v.float64(),
    params: v.optional(v.any()),
  }).index("by_schoolId", ["schoolId"]),

  analytics_snapshots: defineTable({
    schoolId: v.id("schools"),
    snapshotDate: v.float64(),
    totalStudents: v.number(),
    totalBooks: v.number(),
    activeBorrowings: v.number(),
    overdueCount: v.number(),
    totalBorrowingsAllTime: v.number(),
    totalFines: v.number(),
    unpaidFines: v.number(),
    featuresEnabled: v.number(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_snapshotDate", ["snapshotDate"]),

  // ── CBC Curriculum Support ────────────────────────────────────────

  subjects: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    code: v.string(),
    level: v.union(
      v.literal("pre_primary"),
      v.literal("lower_primary"),
      v.literal("upper_primary"),
      v.literal("junior_secondary"),
      v.literal("senior_secondary"),
      v.literal("general"),
    ),
  }).index("by_schoolId", ["schoolId"])
    .index("by_level", ["schoolId", "level"]),

  terms: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    year: v.number(),
    startDate: v.float64(),
    endDate: v.float64(),
    isCurrent: v.boolean(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_current", ["schoolId", "isCurrent"]),

  // ── Teachers ──────────────────────────────────────────────────────

  teachers: defineTable({
    schoolId: v.id("schools"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    staffNo: v.string(),
    department: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_staffNo", ["schoolId", "staffNo"]),

  teacher_subjects: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
  }).index("by_schoolId", ["schoolId"])
    .index("by_teacherId", ["teacherId"])
    .index("by_subjectId", ["subjectId"])
    .index("by_classId", ["classId"]),

  // ── Exams & Results ───────────────────────────────────────────────

  exams: defineTable({
    schoolId: v.id("schools"),
    termId: v.id("terms"),
    name: v.string(),
    date: v.float64(),
    examType: v.union(
      v.literal("mid_term"),
      v.literal("end_term"),
      v.literal("cat"),
      v.literal("assignment"),
      v.literal("other"),
    ),
  }).index("by_schoolId", ["schoolId"])
    .index("by_termId", ["termId"]),

  exam_results: defineTable({
    schoolId: v.id("schools"),
    examId: v.id("exams"),
    studentId: v.id("students"),
    subjectId: v.id("subjects"),
    marks: v.number(),
    grade: v.optional(v.string()),
    comment: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_examId", ["examId"])
    .index("by_studentId", ["studentId"])
    .index("by_examId_and_subjectId", ["examId", "subjectId"]),

  // ── Attendance ────────────────────────────────────────────────────

  attendance: defineTable({
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    studentId: v.id("students"),
    date: v.float64(),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("late"),
      v.literal("excused"),
    ),
    markedBy: v.string(),
    note: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_classId_and_date", ["classId", "date"])
    .index("by_studentId", ["studentId"])
    .index("by_date", ["schoolId", "date"]),

  // ── Timetable ─────────────────────────────────────────────────────

  timetable_entries: defineTable({
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    subjectId: v.id("subjects"),
    teacherId: v.optional(v.id("teachers")),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    room: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_classId", ["classId"])
    .index("by_teacherId", ["teacherId"]),

  // ── Events ────────────────────────────────────────────────────────

  events: defineTable({
    schoolId: v.id("schools"),
    title: v.string(),
    description: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.float64(),
    eventType: v.union(
      v.literal("academic"),
      v.literal("holiday"),
      v.literal("exam"),
      v.literal("sports"),
      v.literal("cultural"),
      v.literal("meeting"),
      v.literal("other"),
    ),
    isHoliday: v.boolean(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_startDate", ["schoolId", "startDate"])
    .index("by_eventType", ["schoolId", "eventType"]),

  // ── Inventory ─────────────────────────────────────────────────────

  inventory_items: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.string(),
    quantity: v.number(),
    condition: v.union(
      v.literal("good"),
      v.literal("fair"),
      v.literal("poor"),
      v.literal("damaged"),
    ),
    location: v.optional(v.string()),
    purchaseDate: v.optional(v.float64()),
    purchasePrice: v.optional(v.number()),
    lastChecked: v.optional(v.float64()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_category", ["schoolId", "category"])
    .index("by_condition", ["schoolId", "condition"]),
});