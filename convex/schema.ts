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
    tagline: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("trial"),
    )),
    // ── Flexible Leadership Naming (Phase 1) ─────────────────────────
    // Display title for the leadership role, e.g. "Headteacher", "Director".
    // Empty/undefined => defaults to "Principal".
    leadershipTitle: v.optional(v.string()),
  }).index("by_clerkOrgId", ["clerkOrgId"])
    .index("by_slug", ["slug"]),

  // ── School Blueprint (flexibility phase 1) ─────────────────────────
  // Per-school configuration for how THIS school works: admission/staff
  // number conventions, term naming, and grading scale. Every school gets a
  // doc here (seeded lazily with defaults), so existing schools behave
  // exactly as before until the principal customises it. Counters are bumped
  // transactionally inside the same insert mutation that issues the number.
  school_blueprints: defineTable({
    schoolId: v.id("schools"),
    // Admission number convention: prefix + pattern tokens.
    admissionPrefix: v.string(),
    admissionPattern: v.string(), // e.g. "{prefix}-{year}-{seq}"
    admissionCounter: v.number(),
    // Staff number convention.
    staffPrefix: v.string(),
    staffPattern: v.string(),
    staffCounter: v.number(),
    // Term naming: "Term {n}", "Semester {n}", or a literal string.
    termNaming: v.string(),
    termsPerYear: v.number(),
    // Grading scale: ascending bands, top band first.
    gradingScale: v.array(
      v.object({
        min: v.number(),
        max: v.number(),
        grade: v.string(),
        comment: v.optional(v.string()),
      })
    ),
  }).index("by_schoolId", ["schoolId"]),

  // ── Identity Engine (flexibility phase 2) ─────────────────────────
  // Remembers that a row signature (normalized name + context) maps to a
  // specific student or staff member. Lets scattered files tie rows to the
  // same person by name, with a human review queue for ambiguous matches.
  identity_links: defineTable({
    schoolId: v.id("schools"),
    entityKind: v.union(v.literal("student"), v.literal("staff")),
    rowKey: v.string(), // normalized signature: "gideon waweru : grade 1"
    name: v.string(),
    resolvedId: v.optional(v.union(v.id("students"), v.id("teachers"))),
    confidence: v.number(),
    status: v.union(
      v.literal("auto"),
      v.literal("needs_review"),
      v.literal("resolved"),
      v.literal("dismissed")
    ),
    sourceFile: v.optional(v.string()),
  })
    .index("by_schoolId_status", ["schoolId", "status"])
    .index("by_schoolId_rowKey", ["schoolId", "rowKey"]),

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

  // ── Students (semantic core only — Phase 18) ───────────────────────
  // Everything beyond this hidden typed core is school-defined EAV data.
  // The school's own fields (defined manually or created from an upload with
  // AI consent) hold gender, DOB, guardian, boarding, etc. — never hard-coded
  // columns. This core exists purely so the engine can link records
  // (classId), de-duplicate (admNo), and search (name) reliably.
  students: defineTable({
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    firstName: v.string(),
    lastName: v.string(),
    admNo: v.string(),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("graduated"),
        v.literal("withdrawn"),
        v.literal("suspended")
      )
    ),
    photoUrl: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_classId", ["classId"])
    .index("by_admNo", ["schoolId", "admNo"])
    // _creationTime is auto-appended by Convex; no need to specify it explicitly.
    // One search index per field (searchField is a single string in Convex);
    // schoolId is a filterField so searches are tenant-scoped.
    .searchIndex("search_firstName", { searchField: "firstName", filterFields: ["schoolId"] })
    .searchIndex("search_lastName", { searchField: "lastName", filterFields: ["schoolId"] })
    .searchIndex("search_admNo", { searchField: "admNo", filterFields: ["schoolId"] }),

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
    condition: v.optional(v.string()),
    category: v.optional(v.string()),
    location: v.optional(v.string()),
    acquisitionDate: v.optional(v.float64()),
  }).index("by_schoolId", ["schoolId"]),

  admins: defineTable({
    userId: v.string(),
    email: v.string(),
    role: v.literal("superadmin"),
  }).index("by_userId", ["userId"]),

  members: defineTable({
    userId: v.string(),
    schoolId: v.id("schools"),
    role: v.string(), // stable role key, e.g. "principal" / "teacher" (renameable display name lives in roles table)
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    hasSeenTour: v.optional(v.boolean()),
    // ── Access lifecycle (role management) ────────────────────────
    // active = normal; suspended = temporarily blocked (can log in, sees
    // the head's message, no data access); revoked = permanently removed
    // (member row is deleted, but kept here for history/audit if re-added).
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("revoked"),
      )
    ),
    statusMessage: v.optional(v.string()), // the head's message shown to the member
    statusUpdatedAt: v.optional(v.float64()),
  }).index("by_userId", ["userId"])
    .index("by_schoolId", ["schoolId"])
    .index("by_userId_and_schoolId", ["userId", "schoolId"]),

  // ── Role invitations (head → invitee) ─────────────────────────────
  // Local tracking rows for the invite-by-email flow. The actual delivery
  // email + account creation is handled by Clerk (org invitation with
  // appRole metadata); this row powers the head's invite management UI and
  // the acceptance notification.

  invitations: defineTable({
    schoolId: v.id("schools"),
    email: v.string(),
    role: v.string(), // stable role key granted on acceptance
    roleName: v.string(), // display-name snapshot for UI/notification
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    clerkInvitationId: v.optional(v.string()),
    invitedBy: v.string(), // acting head's userId
    invitedByEmail: v.optional(v.string()),
    createdAt: v.float64(),
    expiresAt: v.float64(),
    acceptedAt: v.optional(v.float64()),
    revokedAt: v.optional(v.float64()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_email_schoolId", ["email", "schoolId"])
    .index("by_clerkInvitationId", ["clerkInvitationId"]),

  subscriptions: defineTable({
    schoolId: v.id("schools"),
    planType: v.string(),
    status: v.union(
      v.literal("trial"),
      v.literal("active"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("past_due"),
    ),
    trialStartedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    paystackCustomerCode: v.optional(v.string()),
    paystackSubscriptionCode: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    nextBillingDate: v.optional(v.number()),
    lastPaymentAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()), // when the user clicked Cancel
    // ── AI Tier Assignment ──────────────────────────────────────
    // Populated by the tier-assignment AI after onboarding completes.
    recommendedTier: v.optional(v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    )),
    tierScore: v.optional(v.number()), // 0-100 combined score
    tierAnalysis: v.optional(v.string()), // AI reasoning text
    tierAssignedAt: v.optional(v.number()),
    assignedPlanCode: v.optional(v.string()), // Paystack plan code for the assigned tier
    // ── Superadmin Tier Override ────────────────────────────────
    // When set, this takes precedence over recommendedTier for billing.
    overriddenTier: v.optional(v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    )),
    overriddenAt: v.optional(v.number()),
    overriddenBy: v.optional(v.string()), // superadmin userId
    overrideReason: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_status", ["status"]),

  // ── Webhook Event Log (for idempotency & audit) ──────────────────
  webhook_events: defineTable({
    eventId: v.string(), // Paystack event ID
    event: v.string(), // e.g., "charge.success"
    processedAt: v.number(),
    reference: v.optional(v.string()), // Transaction reference
    schoolId: v.optional(v.id("schools")),
    amount: v.optional(v.number()),
    status: v.string(), // "processed" | "duplicate" | "failed"
  }).index("by_eventId", ["eventId"])
    .index("by_reference", ["reference"])
    .index("by_schoolId", ["schoolId"]),

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

  // ── School Fees (Phase 2) ─────────────────────────────────────────
  // What each class/stream is charged per term. Student balances are
  // computed on the fly from structures minus payments (no bill table to
  // keep in sync).

  fee_structures: defineTable({
    schoolId: v.id("schools"),
    classId: v.id("classes"),
    termId: v.id("terms"),
    streamId: v.optional(v.id("streams")),
    amount: v.number(),
    feeCategory: v.optional(v.string()),
    discounts: v.optional(v.array(v.any())),
    scholarship: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_class_term", ["classId", "termId"])
    .index("by_term", ["schoolId", "termId"]),

  fee_payments: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    termId: v.id("terms"),
    amount: v.number(),
    method: v.union(
      v.literal("cash"),
      v.literal("mpesa"),
      v.literal("bank_transfer"),
      v.literal("other")
    ),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
    receivedBy: v.string(),
    receivedAt: v.float64(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_studentId", ["studentId"])
    .index("by_term", ["schoolId", "termId"])
    .index("by_student_term", ["studentId", "termId"]),

  report_logs: defineTable({
    schoolId: v.id("schools"),
    generatedBy: v.string(),
    reportType: v.string(),
    generatedAt: v.float64(),
    params: v.optional(v.any()),
  }).index("by_schoolId", ["schoolId"]),

  // ── EAV Metadata Schema (Phase 0) ───────────────────────────────
  // Modules are the top-level grouping (e.g. "Academics", "Library", "Finance").
  // A school can toggle modules on/off.

  modules: defineTable({
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
      v.literal("platform"),
    ),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    isEnabled: v.boolean(),
    isCustom: v.boolean(),
    isSystem: v.boolean(), // true = seeded default structure
    icon: v.optional(v.string()), // lucide icon name for nav/tab surfaces
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_bucket", ["schoolId", "bucket"]),

  // Sections divide a module into logical groups
  // (e.g. Module "Academics" → Sections "Attendance", "Exams", "Results")

  sections: defineTable({
    schoolId: v.id("schools"),
    moduleId: v.id("modules"),
    parentId: v.optional(v.id("sections")), // for recursive nesting (subsections)
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    isEnabled: v.boolean(),
    isSystem: v.boolean(), // true = seeded default, not user-deletable as a whole
    // isRepeatable marks a section as a repeatable group (allergies, medications,
    // growth logs, etc.). Each instance gets its own fieldValues set keyed by
    // fieldValues.instanceId.
    isRepeatable: v.optional(v.boolean()),
    // isSensitive nodes (counseling notes, medical detail, finance amounts) are
    // default-deny in resolveEffectiveAccess: an explicit permission row is
    // required, no inheritance from the parent section/module.
    isSensitive: v.optional(v.boolean()),
  })
    .index("by_moduleId", ["moduleId"])
    .index("by_schoolId", ["schoolId"])
    .index("by_parentId", ["parentId"]),

  // Fields define the individual data points within a section.
  // inputType determines how the field is rendered in the UI.

  fields: defineTable({
    schoolId: v.id("schools"),
    sectionId: v.id("sections"),
    name: v.string(),
    inputType: v.union(
      v.literal("text_short"),
      v.literal("text_long"),
      v.literal("number"),
      v.literal("date"),
      v.literal("boolean"),
      v.literal("dropdown_single"),
      v.literal("dropdown_multi"),
      v.literal("file"),
    ),
    options: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
    isCustom: v.boolean(),
    isSystem: v.boolean(),
    isEnabled: v.optional(v.boolean()), // false = hidden from record forms until re-enabled (undefined = enabled)
    createdBy: v.optional(v.string()),
    aliases: v.array(v.string()),
    order: v.number(),
    isSensitive: v.optional(v.boolean()),
    // Soft-delete: null = active, timestamp = archived (hidden but recoverable).
    deletedAt: v.optional(v.float64()),
    // ── Typed semantic core (Phase 18) ─────────────────────────────
    // The school's field is tagged with a semantic meaning so the engine can
    // compute on it (amounts, dates, marks, class, status, admission number).
    // This is NOT a hard-coded input — the label/aliases/options are all the
    // school's; the semantic tag just tells the engine what a column is FOR.
    // A school can have 1 or 100 detail fields; only columns tagged with a
    // semantic become computable/linkable.
    semantic: v.optional(
      v.union(
        v.literal("name"),
        v.literal("admNo"),
        v.literal("amount"),
        v.literal("date"),
        v.literal("marks"),
        v.literal("class"),
        v.literal("status"),
      )
    ),
  })
    .index("by_sectionId", ["sectionId"])
    .index("by_schoolId", ["schoolId"]),

  // Field values store the actual data for a record against a field.
  // All values are stored as strings and typed at read time via field.inputType.

  fieldValues: defineTable({
    schoolId: v.id("schools"),
    recordId: v.id("records"),
    fieldId: v.id("fields"),
    value: v.string(),
    // Groups values belonging to one repeatable instance. undefined = flat
    // (non-repeatable) values for the record.
    instanceId: v.optional(v.string()),
  })
    .index("by_recordId", ["recordId"])
    .index("by_fieldId", ["fieldId"])
    .index("by_recordId_fieldId", ["recordId", "fieldId"])
    .index("by_recordId_instance", ["recordId", "instanceId"])
    .index("by_schoolId", ["schoolId"])
    .searchIndex("search_value", {
      searchField: "value",
      filterFields: ["schoolId"],
    }),

  // Records are the top-level entities in each bucket.
  // displayName and photoUrl are denormalized for fast search/display.

  records: defineTable({
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
    ),
    displayName: v.string(),
    photoUrl: v.optional(v.string()),
    status: v.optional(v.string()),
    // Direct link to a student record (for learner bucket). Enables the
    // Student 360° profile to find EAV data without a name-based search.
    studentId: v.optional(v.id("students")),
    // Direct link to a teacher record (for staff buckets). Imported staff
    // EAV values resolve through this instead of a name-based search.
    teacherId: v.optional(v.id("teachers")),
    // Soft-delete: null = active, timestamp = archived (hidden but recoverable).
    deletedAt: v.optional(v.float64()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_bucket", ["schoolId", "bucket"])
    .index("by_studentId", ["studentId"])
    .index("by_teacherId", ["teacherId"])
    .searchIndex("search_displayName", {
      searchField: "displayName",
      filterFields: ["schoolId"],
    }),

  // ── Permission Schema (Phase 0) ──────────────────────────────────
  // Roles define what a user can be (e.g. "Teacher", "Librarian", "Bursar").

  roles: defineTable({
    schoolId: v.id("schools"),
    key: v.string(), // stable identifier, e.g. "principal" — used by auth gates
    name: v.string(), // editable display name, e.g. "Headteacher"
    description: v.optional(v.string()),
    baseBucket: v.string(),
    isDefault: v.boolean(),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_key", ["schoolId", "key"]),

  // Permissions map a role to a specific node (module/section/field) and
  // define the access level (none/view/edit).

  permissions: defineTable({
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    nodeType: v.union(
      v.literal("module"),
      v.literal("section"),
      v.literal("field"),
    ),
    nodeId: v.string(),
    access: v.union(
      v.literal("none"),
      v.literal("view"),
      v.literal("edit"),
    ),
  })
    .index("by_roleId", ["roleId"])
    .index("by_schoolId_roleId", ["schoolId", "roleId"]),

  // Scope rules define what data a role can see within a bucket.
  // e.g. a teacher might only see "assigned_class" students.

  scopeRules: defineTable({
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    bucket: v.string(),
    scope: v.union(
      v.literal("all"),
      v.literal("assigned_class"),
      v.literal("assigned_subject_classes"),
      v.literal("own_record"),
      v.literal("own_children_only"),
      v.literal("lookup_on_demand"),
    ),
  })
    .index("by_roleId", ["roleId"])
    .index("by_schoolId", ["schoolId"]),

  // Staff assignments link a staff record to specific targets
  // (classes, subjects, duties) with optional extra permissions.

  staffAssignments: defineTable({
    schoolId: v.id("schools"),
    staffRecordId: v.id("records"),
    assignmentType: v.string(),
    targetId: v.string(),
    extraPermissions: v.optional(v.any()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
  })
    .index("by_staffRecordId", ["staffRecordId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Generic Entity Links (§2: Relationship Model) ──────────────
  // Any-to-any link table. Schools create/remove/rewire relationships
  // between arbitrary entities without new tables or migrations.
  // Entity endpoints are stored as (tableName, documentId) string pairs
  // to support polymorphic FKs across the entire schema.

  entity_links: defineTable({
    schoolId: v.id("schools"),
    linkType: v.string(), // e.g. "teaches", "enrolled_in", "guardian_of"
    // Entity A ("from" side)
    fromTable: v.string(), // table name, e.g. "students", "teachers"
    fromId: v.string(),    // document _id as string (polymorphic FK)
    // Entity B ("to" side)
    toTable: v.string(),   // table name
    toId: v.string(),      // document _id as string
    // Optional metadata
    role: v.optional(v.string()),     // e.g. "primary", "assistant"
    weight: v.optional(v.number()),   // ordering / priority
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.optional(v.string()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_linkType", ["schoolId", "linkType"])
    .index("by_fromTable_fromId", ["fromTable", "fromId"])
    .index("by_toTable_toId", ["toTable", "toId"])
    .index("by_fromTable_fromId_linkType", ["fromTable", "fromId", "linkType"])
    .index("by_toTable_toId_linkType", ["toTable", "toId", "linkType"]),

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

  // ── Academic Years & Terms (Phase 1) ─────────────────────────────

  academicYears: defineTable({
    schoolId: v.id("schools"),
    label: v.string(),
    startDate: v.float64(),
    endDate: v.float64(),
    status: v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("closed"),
    ),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_status", ["schoolId", "status"]),

  terms: defineTable({
    schoolId: v.id("schools"),
    academicYearId: v.optional(v.id("academicYears")),
    // Recursive parent: Year → Semester → Term → Week → Day (any depth).
    parentId: v.optional(v.id("terms")),
    name: v.string(),
    year: v.number(),
    startDate: v.float64(),
    endDate: v.float64(),
    isCurrent: v.optional(v.boolean()),
    status: v.optional(v.union(
      v.literal("upcoming"),
      v.literal("active"),
      v.literal("closed"),
    )),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_academicYearId", ["academicYearId"])
    .index("by_parentId", ["parentId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_current", ["schoolId", "isCurrent"]),

  // Enrollment record: the anchor for Learner↔Term lifecycle.
  // Tracks active/graduated/withdrawn/suspended status per term, replacing
  // the status lifecycle that previously lived only on students.status.
  enrollments: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    termId: v.id("terms"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    status: v.union(
      v.literal("active"),
      v.literal("graduated"),
      v.literal("withdrawn"),
      v.literal("suspended"),
    ),
    enrolledAt: v.float64(),
    updatedAt: v.float64(),
    notes: v.optional(v.string()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_studentId", ["studentId"])
    .index("by_termId", ["termId"])
    .index("by_studentId_termId", ["studentId", "termId"])
    .index("by_status", ["schoolId", "status"]),

  // Term-bound class assignments: which class/stream a student is in per term.
  // Enables promotion tracking and term-specific attendance/grades.

  classAssignments: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    classId: v.id("classes"),
    streamId: v.optional(v.id("streams")),
    termId: v.id("terms"),
  })
    .index("by_studentId_termId", ["studentId", "termId"])
    .index("by_classId_termId", ["classId", "termId"])
    .index("by_termId", ["termId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Teachers ──────────────────────────────────────────────────────

  teachers: defineTable({
    schoolId: v.id("schools"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    staffNo: v.string(),
    department: v.optional(v.string()),
    // "teaching" = classroom teacher, "non_teaching" = support staff/workers
    // (drivers, cleaners, cooks, security, etc.). Imported staff get tagged so
    // the Teachers page can show a combined, filterable staff list.
    category: v.optional(
      v.union(v.literal("teaching"), v.literal("non_teaching"))
    ),
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
    userId: v.optional(v.string()),
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
    .index("by_teacherId", ["teacherId"])
    .index("by_userId", ["userId"]),

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

  // ── Learner Bucket: Health & Welfare (Phase 2) ─────────────────

  health_records: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    bloodType: v.optional(v.string()),
    rhFactor: v.optional(v.union(v.literal("positive"), v.literal("negative"))),
    weight: v.optional(v.number()), // kg
    height: v.optional(v.number()), // cm
    bmi: v.optional(v.number()), // auto-calculated
    lastPhysicalExam: v.optional(v.float64()),
    physicianName: v.optional(v.string()),
    physicianPhone: v.optional(v.string()),
    physicianClinic: v.optional(v.string()),
    insuranceProvider: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    insuranceExpiry: v.optional(v.float64()),
    nhifNumber: v.optional(v.string()), // Kenya-specific NHIF/SHA
    notes: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    // Backward compatibility fields (used by existing code)
    allergies: v.optional(v.array(v.string())),
    conditions: v.optional(v.array(v.string())),
    medications: v.optional(v.array(v.string())),
    insuranceInfo: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Medical Sub-Records (repeatable, keyed by instanceId) ──────

  student_allergies: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    instanceId: v.string(), // groups fields for one allergy entry
    allergenName: v.string(),
    category: v.union(
      v.literal("food"), v.literal("medication"), v.literal("environmental"),
      v.literal("insect"), v.literal("other"),
    ),
    severity: v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"), v.literal("life-threatening")),
    reactionDescription: v.optional(v.string()),
    firstDocumentedDate: v.optional(v.float64()),
    documentedBy: v.optional(v.string()),
    emergencyMedRequired: v.optional(v.boolean()),
    emergencyMedLocation: v.optional(v.string()),
    lastReactionDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_conditions: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    instanceId: v.string(),
    conditionName: v.string(),
    icd10Code: v.optional(v.string()),
    diagnosisDate: v.optional(v.float64()),
    diagnosingPhysician: v.optional(v.string()),
    severity: v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    managementPlan: v.optional(v.string()),
    activityRestrictions: v.optional(v.string()),
    reviewSchedule: v.optional(v.string()),
    lastReviewDate: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_medications: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    instanceId: v.string(),
    medicationName: v.string(),
    dosage: v.string(),
    frequency: v.union(
      v.literal("once_daily"), v.literal("twice_daily"), v.literal("three_times_daily"),
      v.literal("as_needed"), v.literal("other"),
    ),
    route: v.union(v.literal("oral"), v.literal("topical"), v.literal("inhalation"), v.literal("injection"), v.literal("other")),
    prescribingPhysician: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
    reason: v.optional(v.string()),
    administeredAtSchool: v.optional(v.boolean()),
    selfAdministered: v.optional(v.boolean()),
    storageRequirement: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_immunizations: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    instanceId: v.string(),
    vaccineName: v.string(),
    doseNumber: v.number(), // 1, 2, booster, etc.
    dateAdministered: v.float64(),
    administeringProvider: v.optional(v.string()),
    batchLotNumber: v.optional(v.string()),
    nextDoseDueDate: v.optional(v.float64()),
    exemptionOnFile: v.optional(v.boolean()),
    exemptionType: v.optional(v.union(v.literal("medical"), v.literal("religious"), v.literal("philosophical"))),
    complianceStatus: v.union(v.literal("up_to_date"), v.literal("due_soon"), v.literal("overdue"), v.literal("exempt")),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_disability: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    disabilityType: v.string(),
    diagnosisDocumentation: v.optional(v.string()), // file storage ID
    accommodationsRequired: v.array(v.string()),
    assistiveDevices: v.optional(v.string()),
    mobilityNotes: v.optional(v.string()),
    iepReference: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_dietary: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    restrictionType: v.union(
      v.literal("allergy"), v.literal("intolerance"), v.literal("religious"),
      v.literal("medical"), v.literal("preference"),
    ),
    specificRestriction: v.string(),
    crossRefAllergyId: v.optional(v.string()), // link to student_allergies
    nutritionistNotes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_emergency_medical: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    familyMedicalHistory: v.optional(v.string()),
    emergencyMedicalContact: v.optional(v.string()),
    medicalConsentOnFile: v.boolean(),
    consentDocumentUrl: v.optional(v.string()),
    specialDirectives: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Screenings & Growth Monitoring ────────────────────────────

  student_vision_screenings: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    screeningDate: v.float64(),
    screenedBy: v.string(),
    result: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    leftEyeAcuity: v.optional(v.string()),
    rightEyeAcuity: v.optional(v.string()),
    correctiveLenses: v.optional(v.boolean()),
    referralIssued: v.optional(v.boolean()),
    followUpCompleted: v.optional(v.boolean()),
    nextScreeningDue: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_hearing_screenings: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    screeningDate: v.float64(),
    screenedBy: v.string(),
    leftEarResult: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    rightEarResult: v.union(v.literal("normal"), v.literal("referral"), v.literal("re_test")),
    referralIssued: v.optional(v.boolean()),
    followUpCompleted: v.optional(v.boolean()),
    nextScreeningDue: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_dental_checkups: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    checkupDate: v.float64(),
    dentistClinic: v.string(),
    findings: v.optional(v.string()),
    treatmentRecommended: v.optional(v.string()),
    treatmentCompleted: v.optional(v.boolean()),
    nextCheckupDue: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_growth_logs: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    height: v.number(), // cm
    weight: v.number(), // kg
    bmi: v.number(), // auto-calculated
    percentile: v.optional(v.number()), // against standard growth charts
    flaggedForConcern: v.optional(v.boolean()),
    nurseNotes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Counseling (extra-restricted permission node) ─────────────

  student_counseling_sessions: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionDate: v.float64(),
    counselorName: v.string(),
    sessionType: v.union(v.literal("individual"), v.literal("group"), v.literal("crisis"), v.literal("family")),
    presentingConcern: v.string(),
    sessionNotes: v.string(), // sensitive - separate permission node
    riskLevel: v.union(v.literal("none"), v.literal("low"), v.literal("moderate"), v.literal("high")),
    safetyPlanOnFile: v.optional(v.boolean()),
    safetyPlanDocumentUrl: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  student_counseling_referrals: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionId: v.id("student_counseling_sessions"),
    externalReferralMade: v.boolean(),
    referredTo: v.optional(v.string()),
    reason: v.optional(v.string()),
    followUpStatus: v.optional(v.string()),
    parentInformed: v.optional(v.boolean()),
  }).index("by_studentId", ["studentId"])
    .index("by_sessionId", ["sessionId"]),

  student_counseling_followup: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sessionId: v.id("student_counseling_sessions"),
    planDescription: v.string(),
    reviewDate: v.float64(),
    responsibleStaff: v.string(),
    status: v.union(v.literal("active"), v.literal("closed"), v.literal("escalated")),
  }).index("by_studentId", ["studentId"])
    .index("by_sessionId", ["sessionId"]),

  // ── Clinic Visits (expanded) ──────────────────────────────────

  clinic_visits: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    time: v.optional(v.string()),
    arrivalMethod: v.optional(v.union(v.literal("walk_in"), v.literal("sent_by_teacher"), v.literal("found_unwell"))),
    reportedSymptoms: v.optional(v.string()),
    temperature: v.optional(v.number()),
    pulse: v.optional(v.number()),
    bloodPressure: v.optional(v.string()),
    respiratoryRate: v.optional(v.number()),
    examiningStaff: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
    outcome: v.optional(v.union(v.literal("returned_to_class"), v.literal("sent_home"), v.literal("hospitalized"), v.literal("observation"))),
    timeResolved: v.optional(v.string()),
    // Backward compatibility fields (used by existing code)
    reason: v.optional(v.string()),
    action: v.optional(v.string()),
    followUp: v.optional(v.string()),
    recordedBy: v.optional(v.string()),
    vitalSigns: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId_date", ["schoolId", "date"]),

  counseling_notes: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    counselorName: v.optional(v.string()),
    counselorId: v.optional(v.string()), // backward compatibility
    sessionType: v.optional(v.union(v.literal("individual"), v.literal("group"), v.literal("crisis"), v.literal("family"))),
    presentingConcern: v.optional(v.string()),
    notes: v.string(), // sensitive - separate permission node
    riskLevel: v.optional(v.union(v.literal("none"), v.literal("low"), v.literal("moderate"), v.literal("high"))),
    safetyPlanOnFile: v.optional(v.boolean()),
    isConfidential: v.boolean(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Discipline (Phase 2) ────────────────────────

  discipline_incidents: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    description: v.string(),
    reportedBy: v.string(),
    category: v.string(), // flexible: bullying, academic_dishonesty, property_damage, etc.
    severity: v.optional(v.union(v.literal("minor"), v.literal("moderate"), v.literal("major"), v.literal("critical"))),
    witnesses: v.optional(v.array(v.string())),
    actionType: v.optional(v.union(
      v.literal("verbal_warning"), v.literal("written_warning"), v.literal("detention"),
      v.literal("suspension"), v.literal("expulsion"), v.literal("parent_meeting"),
      v.literal("community_service"), v.literal("other"),
    )),
    // Backward compatibility field (used by existing code)
    actionTaken: v.optional(v.string()),
    actionDate: v.optional(v.float64()),
    actionDuration: v.optional(v.string()),
    authorizedBy: v.optional(v.string()),
    resolutionStatus: v.union(
      v.literal("open"),
      v.literal("investigating"),
      v.literal("resolved"),
      v.literal("escalated"),
      v.literal("appealed"),
    ),
    resolvedAt: v.optional(v.float64()),
    resolvedBy: v.optional(v.string()),
    resolutionNotes: v.optional(v.string()),
    parentAcknowledged: v.optional(v.boolean()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"])
    .index("by_status", ["schoolId", "resolutionStatus"]),

  // ── Learner Bucket: Finance (expanded) ────────────────────────

  scholarships: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    sponsorName: v.string(),
    sponsorshipType: v.union(
      v.literal("full"), v.literal("partial"), v.literal("merit"), v.literal("need_based"),
    ),
    coverageAmount: v.optional(v.number()),
    coveragePercentage: v.optional(v.number()),
    renewalStatus: v.union(v.literal("active"), v.literal("pending"), v.literal("expired")),
    conditions: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Attendance (expanded) ─────────────────────────────────────

  period_attendance: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    classId: v.id("classes"),
    date: v.float64(),
    periodNumber: v.number(),
    subjectId: v.optional(v.id("subjects")),
    teacherId: v.optional(v.id("teachers")),
    status: v.union(v.literal("present"), v.literal("absent"), v.literal("late")),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId_date", ["schoolId", "date"])
    .index("by_classId_date", ["classId", "date"]),

  absence_logs: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    absenceReason: v.union(
      v.literal("sick"), v.literal("family"), v.literal("transport"),
      v.literal("unexcused"), v.literal("other"),
    ),
    supportingDocument: v.optional(v.string()), // file storage ID
    excused: v.boolean(),
    parentNotified: v.boolean(),
    parentNotifiedAt: v.optional(v.float64()),
    notes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Report Cards ──────────────────────────────────────────────

  student_report_cards: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    termId: v.id("terms"),
    reportCardUrl: v.optional(v.string()), // generated PDF
    teacherComment: v.optional(v.string()),
    headteacherComment: v.optional(v.string()),
    attendanceSummary: v.optional(v.string()),
    promotionRecommendation: v.union(
      v.literal("promote"), v.literal("repeat"), v.literal("under_review"),
    ),
    parentAcknowledged: v.boolean(),
    generatedAt: v.float64(),
    generatedBy: v.string(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"])
    .index("by_termId", ["termId"]),

  // ── Academic History ──────────────────────────────────────────

  student_academic_history: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    academicYear: v.string(),
    fromClassId: v.id("classes"),
    toClassId: v.id("classes"),
    fromStreamId: v.optional(v.id("streams")),
    toStreamId: v.optional(v.id("streams")),
    outcome: v.union(v.literal("promoted"), v.literal("repeated"), v.literal("transferred")),
    date: v.float64(),
    decisionBasis: v.union(v.literal("automatic"), v.literal("exam_based"), v.literal("committee")),
    notes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learning Support ──────────────────────────────────────────

  student_learning_support: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    specialNeedsFlag: v.boolean(),
    iepNotes: v.optional(v.string()), // Individualized Education Plan
    learningSupportSessions: v.optional(v.number()),
    remedialClassEnrolled: v.optional(v.boolean()),
    giftedProgramEnrolled: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Promotion/Progression (Phase 2) ────────────

  promotion_history: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    fromClassId: v.id("classes"),
    toClassId: v.id("classes"),
    fromStreamId: v.optional(v.id("streams")),
    toStreamId: v.optional(v.id("streams")),
    termId: v.id("terms"),
    outcome: v.optional(v.union(v.literal("promoted"), v.literal("repeated"), v.literal("transferred"))),
    reason: v.optional(v.string()),
    promotedBy: v.string(),
    promotedAt: v.float64(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"])
    .index("by_termId", ["termId"]),

  // ── Transfer Records ─────────────────────────────────────────

  transfer_records: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    transferType: v.union(v.literal("in"), v.literal("out")),
    fromSchool: v.optional(v.string()),
    toSchool: v.optional(v.string()),
    transferDate: v.float64(),
    reason: v.optional(v.string()),
    transferLetterIssued: v.optional(v.boolean()),
    transferLetterUrl: v.optional(v.string()),
    recordedBy: v.string(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Graduation Records ───────────────────────────────────────

  graduation_records: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    graduationDate: v.float64(),
    certificateIssued: v.boolean(),
    certificateUrl: v.optional(v.string()),
    finalRecordSnapshot: v.optional(v.string()), // file storage ID
    recordedBy: v.string(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Boarding ──────────────────────────────────

  boarding_records: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    dormName: v.string(),
    roomNumber: v.string(),
    bedNumber: v.optional(v.string()),
    matronPatronAssigned: v.optional(v.string()),
    academicYearId: v.id("academicYears"),
    isActive: v.boolean(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  boarding_welfare_checks: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    checkDate: v.float64(),
    checkedBy: v.string(),
    welfareStatus: v.string(),
    concernsFlagged: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  boarding_leave_requests: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    requestDate: v.float64(),
    reason: v.string(),
    destination: v.string(),
    pickupPerson: v.string(),
    expectedReturnDate: v.float64(),
    actualReturnDate: v.optional(v.float64()),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("returned")),
    approvedBy: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Feeding ───────────────────────────────────

  feeding_plans: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    planType: v.union(v.literal("full_board"), v.literal("day_scholar"), v.literal("special_diet")),
    dietaryRestriction: v.optional(v.string()),
    allergyCrossRef: v.optional(v.string()), // link to student_allergies
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
    isActive: v.boolean(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Transport Assignments ─────────────────────

  student_transport_assignments: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    routeId: v.id("transport_routes"),
    pickupPoint: v.string(),
    dropOffPoint: v.string(),
    academicYearId: v.id("academicYears"),
    isActive: v.boolean(),
  }).index("by_studentId", ["studentId"])
    .index("by_routeId", ["routeId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Learner Bucket: Documents (Phase 2) ────────────────────────

  student_documents: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    name: v.string(),
    category: v.string(), // flexible: birth_certificate, national_id, passport, etc.
    fileStorageId: v.string(),
    uploadedBy: v.string(),
    uploadedAt: v.float64(),
    expiryDate: v.optional(v.float64()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Import audit trail (Phase 2.2) ───────────────────────────────
  // One row per file processed by the Import Studio. Powers the
  // duplicate/wrong-section audit: who ran it, what happened per row.

  import_runs: defineTable({
    schoolId: v.id("schools"),
    fileName: v.string(),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("success"), v.literal("partial"), v.literal("failed")),
    studentsCreated: v.number(),
    studentsSkipped: v.number(),
    studentsOverwritten: v.number(),
    staffCreated: v.number(),
    staffSkipped: v.number(),
    staffOverwritten: v.number(),
    structuresCreated: v.number(),
    errors: v.number(),
    ranBy: v.string(),
    runAt: v.float64(),
    // Checkpoint/resume fields
    totalRows: v.optional(v.number()),
    lastProcessedRow: v.optional(v.number()),
    kind: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"]),

  import_row_results: defineTable({
    schoolId: v.id("schools"),
    runId: v.id("import_runs"),
    row: v.number(),
    kind: v.union(v.literal("student"), v.literal("staff"), v.literal("fee")),
    status: v.union(
      v.literal("created"),
      v.literal("skipped"),
      v.literal("overwritten"),
      v.literal("error")
    ),
    reason: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
  }).index("by_runId", ["runId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Persisted import mapping profiles (Phase 17C) ───────────────────
  // One row per (school, entity kind). `mapping` maps canonical field keys
  // (system keys like "firstName" or EAV keys like "eav:<fieldId>") to the
  // source file header they came from. Auto-saved after a successful import,
  // user-editable, and reused the next time a file of the same kind arrives
  // (Bulk Operations AND Onboarding).

  import_mappings: defineTable({
    schoolId: v.id("schools"),
    kind: v.union(
      v.literal("students"),
      v.literal("staff"),
      v.literal("fees"),
      v.literal("attendance"),
      v.literal("fee-payments"),
      v.literal("subjects"),
      v.literal("classes"),
      v.literal("terms"),
    ),
    mapping: v.record(v.string(), v.string()),
    updatedBy: v.string(),
    updatedAt: v.float64(),
  }).index("by_schoolId_kind", ["schoolId", "kind"]),

  // ── Export history (Files library in Bulk Operations) ───────────────
  // One row per export the school generates. The CSV itself is re-generated
  // on demand from the live data; this row is the retrievable record of who
  // exported what and when.

  export_runs: defineTable({
    schoolId: v.id("schools"),
    kind: v.string(), // "students" | "staff" | ...
    label: v.string(), // human label, e.g. "Students"
    fileName: v.string(), // e.g. "students-2026-08-12.csv"
    rowCount: v.number(),
    ranBy: v.string(),
    runAt: v.float64(),
  }).index("by_schoolId", ["schoolId"]),

  // ── Guided-tour state per member (Phase 2.3) ───────────────────────
  // Powers the two-part post-onboarding tour: which part is in progress,
  // when each part was completed, and the permanent X dismissal (both parts).

  tour_states: defineTable({
    memberId: v.id("members"),
    schoolId: v.id("schools"),
    currentPart: v.optional(v.union(v.literal("part1"), v.literal("part2"))),
    dismissedAt: v.optional(v.float64()),
    part1CompletedAt: v.optional(v.float64()),
    part2CompletedAt: v.optional(v.float64()),
    updatedAt: v.float64(),
  }).index("by_memberId_schoolId", ["memberId", "schoolId"]),

  // ── Learner Bucket: Extracurricular (Phase 2) ──────────────────

  extracurricular_activities: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal("sports"),
      v.literal("clubs"),
      v.literal("arts"),
      v.literal("debate"),
      v.literal("community_service"),
      v.literal("other"),
    ),
    schedule: v.optional(v.string()),
    venue: v.optional(v.string()),
    coordinatorId: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_category", ["schoolId", "category"]),

  student_activities: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    activityId: v.id("extracurricular_activities"),
    role: v.optional(v.string()),
    joinedAt: v.float64(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_studentId", ["studentId"])
    .index("by_activityId", ["activityId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Teaching Staff Bucket: Lesson Planning (Phase 3) ───────────

  schemes_of_work: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    subjectId: v.id("subjects"),
    classId: v.id("classes"),
    termId: v.id("terms"),
    weekNumber: v.number(),
    topic: v.string(),
    objectives: v.array(v.string()),
    resources: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("taught"),
    ),
  }).index("by_teacherId_termId", ["teacherId", "termId"])
    .index("by_schoolId", ["schoolId"]),

  lesson_plans: defineTable({
    schoolId: v.id("schools"),
    schemeId: v.id("schemes_of_work"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    objectives: v.array(v.string()),
    activities: v.string(),
    assessment: v.optional(v.string()),
    reflection: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("taught"),
      v.literal("reviewed"),
    ),
  }).index("by_schemeId", ["schemeId"])
    .index("by_teacherId_date", ["teacherId", "date"])
    .index("by_schoolId", ["schoolId"]),

  // ── Teaching Staff Bucket: Duty Roster (Phase 3) ──────────────

  duty_roster_entries: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    dutyType: v.union(
      v.literal("gate"),
      v.literal("lunch"),
      v.literal("compound"),
      v.literal("exam_supervision"),
      v.literal("other"),
    ),
    description: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
  }).index("by_schoolId_date", ["schoolId", "date"])
    .index("by_teacherId", ["teacherId"]),

  // ── Teaching Staff Bucket: Staff Attendance (Phase 3) ──────────

  staff_attendance: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    date: v.float64(),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("late"),
      v.literal("excused"),
    ),
    checkInTime: v.optional(v.string()),
    checkOutTime: v.optional(v.string()),
    note: v.optional(v.string()),
  }).index("by_schoolId_date", ["schoolId", "date"])
    .index("by_teacherId", ["teacherId"])
    .index("by_teacherId_date", ["teacherId", "date"]),

  // ── Teaching Staff Bucket: HR & Performance (Phase 3) ──────────

  leave_requests: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    leaveType: v.union(
      v.literal("annual"),
      v.literal("sick"),
      v.literal("maternity"),
      v.literal("paternity"),
      v.literal("compassionate"),
      v.literal("study"),
      v.literal("other"),
    ),
    startDate: v.float64(),
    endDate: v.float64(),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("cancelled"),
    ),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.float64()),
  }).index("by_teacherId", ["teacherId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_schoolId", ["schoolId"]),

  appraisals: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    reviewDate: v.float64(),
    reviewerId: v.string(),
    rating: v.number(),
    strengths: v.optional(v.string()),
    improvements: v.optional(v.string()),
    goals: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_teacherId", ["teacherId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Teaching Staff Bucket: Parent Meetings (Phase 3) ───────────

  parent_meetings: defineTable({
    schoolId: v.id("schools"),
    teacherId: v.id("teachers"),
    studentId: v.optional(v.id("students")),
    date: v.float64(),
    topic: v.string(),
    notes: v.optional(v.string()),
    outcome: v.optional(v.string()),
    followUpDate: v.optional(v.float64()),
  }).index("by_teacherId", ["teacherId"])
    .index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Non-Teaching Staff: Library Expansion (Phase 4) ────────────

  book_holds: defineTable({
    schoolId: v.id("schools"),
    bookId: v.id("books"),
    studentId: v.id("students"),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("fulfilled"),
      v.literal("cancelled"),
    ),
    requestedAt: v.float64(),
    readyAt: v.optional(v.float64()),
    fulfilledAt: v.optional(v.float64()),
  }).index("by_bookId", ["bookId"])
    .index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  book_transfers: defineTable({
    schoolId: v.id("schools"),
    bookId: v.id("books"),
    fromClassId: v.id("classes"),
    toClassId: v.id("classes"),
    quantity: v.number(),
    date: v.float64(),
    reason: v.optional(v.string()),
    transferredBy: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_bookId", ["bookId"]),

  // ── Non-Teaching Staff: Medical/Health (Phase 4) ──────────────

  medical_supplies: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    category: v.string(),
    quantity: v.number(),
    unit: v.string(),
    minStock: v.number(),
    lastRestocked: v.optional(v.float64()),
    location: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_category", ["schoolId", "category"]),

  vaccination_records: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    vaccineName: v.string(),
    dateGiven: v.float64(),
    nextDueDate: v.optional(v.float64()),
    batchNumber: v.optional(v.string()),
    administeredBy: v.string(),
    notes: v.optional(v.string()),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Non-Teaching Staff: Transport (Phase 4) ───────────────────

  transport_routes: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    pickupPoints: v.array(v.string()),
    vehicleReg: v.optional(v.string()),
    driverName: v.optional(v.string()),
    driverPhone: v.optional(v.string()),
    capacity: v.number(),
    isActive: v.boolean(),
  }).index("by_schoolId", ["schoolId"]),

  route_logs: defineTable({
    schoolId: v.id("schools"),
    routeId: v.id("transport_routes"),
    date: v.float64(),
    direction: v.union(v.literal("morning"), v.literal("evening")),
    studentCount: v.number(),
    notes: v.optional(v.string()),
    recordedBy: v.string(),
  }).index("by_routeId", ["routeId"])
    .index("by_schoolId_date", ["schoolId", "date"]),

  vehicle_maintenance: defineTable({
    schoolId: v.id("schools"),
    vehicleReg: v.string(),
    serviceType: v.string(),
    date: v.float64(),
    cost: v.optional(v.number()),
    provider: v.optional(v.string()),
    nextServiceDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_vehicleReg", ["schoolId", "vehicleReg"]),

  // ── Non-Teaching Staff: Gate/Security (Phase 4) ───────────────

  visitor_log: defineTable({
    schoolId: v.id("schools"),
    visitorName: v.string(),
    idNumber: v.optional(v.string()),
    phone: v.optional(v.string()),
    purpose: v.string(),
    personToVisit: v.optional(v.string()),
    checkInTime: v.float64(),
    checkOutTime: v.optional(v.float64()),
    recordedBy: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_checkInTime", ["schoolId", "checkInTime"]),

  gate_student_log: defineTable({
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    type: v.union(v.literal("early_leave"), v.literal("late_arrival")),
    time: v.string(),
    reason: v.string(),
    approvedBy: v.string(),
  }).index("by_studentId", ["studentId"])
    .index("by_schoolId_date", ["schoolId", "date"]),

  // ── Non-Teaching Staff: Facilities (Phase 4) ──────────────────

  maintenance_tasks: defineTable({
    schoolId: v.id("schools"),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("urgent")),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
    ),
    assignedTo: v.optional(v.string()),
    reportedBy: v.string(),
    reportedAt: v.float64(),
    completedAt: v.optional(v.float64()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_status", ["schoolId", "status"]),

  // ── Admin Staff Bucket: Admissions (Phase 5) ──────────────────

  admission_applications: defineTable({
    schoolId: v.id("schools"),
    applicantName: v.string(),
    dateOfBirth: v.float64(),
    gender: v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    previousSchool: v.optional(v.string()),
    guardianName: v.string(),
    guardianPhone: v.string(),
    guardianEmail: v.optional(v.string()),
    desiredClassId: v.id("classes"),
    applicationDate: v.float64(),
    status: v.union(
      v.literal("pending"),
      v.literal("under_review"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("waitlisted"),
    ),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.float64()),
    notes: v.optional(v.string()),
    documents: v.optional(v.array(v.string())),
  }).index("by_schoolId", ["schoolId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_desiredClassId", ["desiredClassId"]),

  // ── Admin Staff Bucket: Finance Expansion (Phase 5) ───────────

  expenditures: defineTable({
    schoolId: v.id("schools"),
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    date: v.float64(),
    paidTo: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("bank_transfer"),
      v.literal("cheque"),
      v.literal("mobile_money"),
      v.literal("other"),
    ),
    reference: v.optional(v.string()),
    approvedBy: v.string(),
    receiptUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_category", ["schoolId", "category"])
    .index("by_date", ["schoolId", "date"]),

  budgets: defineTable({
    schoolId: v.id("schools"),
    category: v.string(),
    termId: v.id("terms"),
    allocatedAmount: v.number(),
    spentAmount: v.number(),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_termId", ["termId"])
    .index("by_category_term", ["category", "termId"]),

  supplier_payments: defineTable({
    schoolId: v.id("schools"),
    supplierName: v.string(),
    invoiceNumber: v.string(),
    amount: v.number(),
    date: v.float64(),
    dueDate: v.float64(),
    status: v.union(
      v.literal("pending"),
      v.literal("partial"),
      v.literal("paid"),
      v.literal("overdue"),
    ),
    paidAmount: v.number(),
    paidAt: v.optional(v.float64()),
    paymentMethod: v.optional(v.string()),
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_dueDate", ["schoolId", "dueDate"]),

  // ── Admin Staff Bucket: Correspondence (Phase 5) ──────────────

  correspondence: defineTable({
    schoolId: v.id("schools"),
    direction: v.union(v.literal("incoming"), v.literal("outgoing")),
    referenceNumber: v.string(),
    date: v.float64(),
    fromTo: v.string(),
    subject: v.string(),
    summary: v.optional(v.string()),
    category: v.string(),
    status: v.union(
      v.literal("received"),
      v.literal("pending_action"),
      v.literal("actioned"),
      v.literal("filed"),
    ),
    assignedTo: v.optional(v.string()),
    attachmentUrls: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_status", ["schoolId", "status"])
    .index("by_date", ["schoolId", "date"]),

  // ── Admin Staff Bucket: Appointments (Phase 5) ────────────────

  appointments: defineTable({
    schoolId: v.id("schools"),
    title: v.string(),
    date: v.float64(),
    startTime: v.string(),
    endTime: v.string(),
    location: v.optional(v.string()),
    withPerson: v.string(),
    purpose: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("rescheduled"),
    ),
    notes: v.optional(v.string()),
    createdBy: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_date", ["schoolId", "date"])
    .index("by_status", ["schoolId", "status"]),

  // ── Leadership Bucket: Compliance (Phase 6) ───────────────────

  compliance_documents: defineTable({
    schoolId: v.id("schools"),
    documentType: v.union(
      v.literal("registration"),
      v.literal("inspection"),
      v.literal("policy"),
      v.literal("certificate"),
      v.literal("other"),
    ),
    title: v.string(),
    description: v.optional(v.string()),
    fileStorageId: v.optional(v.string()),
    renewalDate: v.optional(v.float64()),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("pending_renewal"),
    ),
    uploadedBy: v.string(),
    uploadedAt: v.float64(),
    notes: v.optional(v.string()),
  }).index("by_schoolId", ["schoolId"])
    .index("by_type", ["schoolId", "documentType"])
    .index("by_status", ["schoolId", "status"]),

  // ── Leadership Bucket: Board Meetings (Phase 6) ───────────────

  board_meetings: defineTable({
    schoolId: v.id("schools"),
    date: v.float64(),
    title: v.string(),
    attendees: v.array(v.string()),
    minutesDocumentId: v.optional(v.string()),
    summary: v.optional(v.string()),
    actionItems: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    createdBy: v.string(),
  }).index("by_schoolId", ["schoolId"])
    .index("by_date", ["schoolId", "date"])
    .index("by_status", ["schoolId", "status"]),

  // ── Leadership Bucket: Announcements (Phase 6) ────────────────

  announcements: defineTable({
    schoolId: v.id("schools"),
    title: v.string(),
    content: v.string(),
    priority: v.union(
      v.literal("low"),
      v.literal("normal"),
      v.literal("high"),
      v.literal("urgent"),
    ),
    targetAudience: v.union(
      v.literal("all"),
      v.literal("staff_only"),
      v.literal("teachers_only"),
      v.literal("parents_only"),
      v.literal("students_only"),
    ),
    isPublished: v.boolean(),
    publishedAt: v.optional(v.float64()),
    expiresAt: v.optional(v.float64()),
    createdBy: v.string(),
    createdAt: v.float64(),
  })  .index("by_schoolId", ["schoolId"])
    .index("by_published", ["schoolId", "isPublished"])
    .index("by_priority", ["schoolId", "priority"]),

  // ── Guardian Entity (Phase 7) ──────────────────────────────────
  // Guardians are the parents/guardians of students.
  // A guardian can be linked to multiple students (siblings).

  guardians: defineTable({
    schoolId: v.id("schools"),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    phone2: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    relationship: v.string(),
    communicationPreference: v.optional(
      v.union(
        v.literal("sms"),
        v.literal("call"),
        v.literal("email"),
        v.literal("app"),
      )
    ),
    preferredLanguage: v.optional(v.string()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_phone", ["schoolId", "phone"])
    .searchIndex("search_name", {
      searchField: "firstName",
      filterFields: ["schoolId"],
    }),

  // Links guardians to students. A student can have multiple guardians
  // (e.g. mother + father), one of which is marked as primary.

  guardian_links: defineTable({
    schoolId: v.id("schools"),
    guardianId: v.id("guardians"),
    studentId: v.id("students"),
    isPrimary: v.boolean(),
  })
    .index("by_guardianId", ["guardianId"])
    .index("by_studentId", ["studentId"])
    .index("by_schoolId", ["schoolId"]),

  // ── Notification System (Phase 8) ──────────────────────────────
  // Rules define when notifications should fire.
  // Schools can toggle rules on/off and customize recipients.

  notification_rules: defineTable({
    schoolId: v.id("schools"),
    triggerType: v.string(),
    moduleRef: v.string(),
    condition: v.string(),
    recipientRoles: v.array(v.string()),
    deliveryChannels: v.array(v.string()),
    isEnabled: v.boolean(),
  })
    .index("by_schoolId", ["schoolId"]),

  // Notifications are the actual messages sent to users.
  // They are created by mutations when a trigger condition is met.

  notifications: defineTable({
    schoolId: v.id("schools"),
    ruleId: v.optional(v.string()),
    recipientId: v.string(),
    recipientRole: v.string(),
    relatedRecordId: v.optional(v.string()),
    title: v.string(),
    message: v.string(),
    status: v.union(
      v.literal("unread"),
      v.literal("read"),
      v.literal("actioned"),
    ),
    createdAt: v.float64(),
  })
    .index("by_recipientId", ["recipientId"])
    .index("by_schoolId_status", ["schoolId", "status"])
    .index("by_schoolId_recipient", ["schoolId", "recipientId"]),

  // ── Platform Audit Log ────────────────────────────────────────
  // ── Rate Limiting (server-side) ────────────────────────────────
  rate_limits: defineTable({
    key: v.string(),
    attempts: v.number(),
    windowStart: v.float64(),
    lastAttempt: v.float64(),
  })
    .index("by_key", ["key"]),

  platform_audit_logs: defineTable({
    adminUserId: v.string(),
    adminEmail: v.optional(v.string()),
    targetSchoolId: v.optional(v.id("schools")),
    targetSchoolName: v.optional(v.string()),
    action: v.string(),
    details: v.optional(v.any()),
    reason: v.optional(v.string()),
    timestamp: v.float64(),
  })
    .index("by_adminUserId", ["adminUserId"])
    .index("by_targetSchoolId", ["targetSchoolId"])
    .index("by_timestamp", ["timestamp"]),

  // ── Tier History (tracks tier changes over time) ──────────────
  // Each row is a snapshot of a tier assignment or change.
  tier_history: defineTable({
    schoolId: v.id("schools"),
    previousTier: v.optional(v.string()),
    newTier: v.string(),
    changeType: v.union(
      v.literal("ai_assigned"),      // AI assigned during onboarding
      v.literal("superadmin_override"), // Manual override
      v.literal("override_cleared"),   // Override removed, reverted to AI
      v.literal("tier_change"),        // General tier change
    ),
    reason: v.optional(v.string()),
    changedBy: v.optional(v.string()), // userId or "system"
    score: v.optional(v.number()),     // AI score at time of assignment
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_changeType", ["changeType"]),

  // ── Onboarding Session (Phase 11 — AI Agent) ─────────────────
  // One session per school, tracks the guided setup wizard progress.
  // AI agent uses this for session isolation — no cross-school context.
  onboarding_sessions: defineTable({
    schoolId: v.id("schools"),
    currentStep: v.number(), // 1-11
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    collectedAnswers: v.any(), // Step-specific answers object
    conversationHistory: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })),
    startedAt: v.float64(),
    completedAt: v.optional(v.float64()),
    lastActivityAt: v.float64(),
    // ── AI Tier Recommendation (populated on completion) ────────
    recommendedTier: v.optional(v.union(
      v.literal("starter"),
      v.literal("professional"),
      v.literal("enterprise"),
    )),
    tierScore: v.optional(v.number()),
    tierAnalysis: v.optional(v.string()),
    tierAssignedAt: v.optional(v.float64()),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_status", ["status"]),

  // ── AI Agent Sessions (16-ai-agent-charter.md §1) ────────────────
  // One conversation per (school, entry point, user). The Mistral
  // conversation_id lives here so every school keeps its own isolated
  // agent session — never shared across schools, no cross-school memory.
  ai_sessions: defineTable({
    schoolId: v.id("schools"),
    userId: v.string(), // Clerk tokenIdentifier / identity subject
    entryPoint: v.string(), // "chat" | "onboarding" | "report"
    moduleName: v.optional(v.string()),
    conversationId: v.optional(v.string()), // Mistral Agents conversation id
    history: v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })),
    createdAt: v.float64(),
    lastActivityAt: v.float64(),
  })
    .index("by_schoolId", ["schoolId"])
    .index("by_schoolId_user_entry", ["schoolId", "userId", "entryPoint"]),

  // ── Dashboard Cache (lazy-computed, TTL-based) ───────────────────
  // Stores precomputed dashboard payloads so page loads serve from cache
  // (1 read) instead of recomputing (100+ reads). Cache is refreshed
  // lazily when stale (>1 hour old). One row per school.
  dashboard_cache: defineTable({
    schoolId: v.id("schools"),
    stats: v.any(),       // full getDashboardStats payload
    analytics: v.any(),   // full getDashboardAnalytics payload
    computedAt: v.float64(),
  }).index("by_schoolId", ["schoolId"]),

  // ── Chart Configuration (§5 — per-page chart customization) ──────
  // Each row represents one configurable chart widget on a dashboard page.
  // Schools can show/hide, reorder, rename, and restyle charts.
  chart_configs: defineTable({
    schoolId: v.id("schools"),
    page: v.string(),           // which page: "dashboard", "analytics", "attendance", "finance"
    chartKey: v.string(),       // unique key for the chart: "fee_collection_trend", "attendance_rate", etc.
    chartType: v.string(),      // "bar" | "line" | "doughnut" | "horizontalBar" | "radial" | "sparkline"
    title: v.string(),          // custom title
    description: v.optional(v.string()),
    isVisible: v.boolean(),     // show/hide toggle
    position: v.number(),       // sort order (lower = higher)
    color: v.optional(v.string()),  // hex color override
    options: v.optional(v.any()),   // chart-specific config (timeRange, filters, etc.)
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_schoolId_page", ["schoolId", "page"])
    .index("by_schoolId_page_key", ["schoolId", "page", "chartKey"]),
});