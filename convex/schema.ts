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
    classId: v.id("classes"),
    name: v.string(),
  }).index("by_classId", ["classId"]),

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
});
