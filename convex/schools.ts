import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  requireAuth,
  requireSuperadmin,
  requireSchoolMembership,
  requireSchoolFromJwt,
  requirePrincipal,
  assertValidHexColor,
  patchDefinedFields,
  logAuditEntry,
} from "./helpers";

// ── Read-only queries ──────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperadmin(ctx);
    return await ctx.db.query("schools").take(500);
  },
});

/** Public-facing lookup by slug (school pages). Returns only safe fields. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!school) return null;
    // Strip sensitive fields before returning to an unauthenticated caller
    return {
      _id: school._id,
      name: school.name,
      slug: school.slug,
      logoUrl: school.logoUrl,
      primaryColor: school.primaryColor,
      secondaryColor: school.secondaryColor,
      accentColor: school.accentColor,
      tagline: school.tagline,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
    };
  },
});

/**
 * Lookup by Clerk org_id — used as a client-side fallback when the JWT
 * path is slow.  If the caller already has an org in their JWT, it
 * must match the requested clerkOrgId to prevent cross-tenant lookups.
 */
export const getByClerkOrgId = query({
  args: { clerkOrgId: v.string() },
  handler: async (ctx, { clerkOrgId }) => {
    const identity = await requireAuth(ctx);
    const jwtOrgId = (identity as Record<string, unknown>)["org_id"] as string | undefined;
    if (jwtOrgId && jwtOrgId !== clerkOrgId) {
      throw new Error("Not authorised for this school");
    }
    return await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", clerkOrgId))
      .first();
  },
});

/**
 * INTERNAL ONLY — not callable from the client.  Used by server-side
 * actions that already verified superadmin status.
 */
export const getById = internalQuery({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    primaryColor: v.string(),
    secondaryColor: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    assertValidHexColor(args.primaryColor, "primaryColor");
    assertValidHexColor(args.secondaryColor, "secondaryColor");
    const schoolId = await ctx.db.insert("schools", args);
    await logAuditEntry(ctx, schoolId, "school.create", { name: args.name, slug: args.slug });
    return schoolId;
  },
});

// Read the school that belongs to the caller's Clerk organisation.
// The org ID is read from the JWT (server-side) so it can never be spoofed.
export const getMySchool = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await requireSchoolFromJwt(ctx);
    } catch {
      return null;
    }
  },
});

// Update branding for the caller's own school (no need to pass an ID).
export const updateMySchool = mutation({
  args: {
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    tagline: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
  },
  handler: async (ctx, updates) => {
    const school = await requireSchoolFromJwt(ctx);
    if (updates.primaryColor) assertValidHexColor(updates.primaryColor, "primaryColor");
    if (updates.secondaryColor) assertValidHexColor(updates.secondaryColor, "secondaryColor");
    if (updates.name !== undefined && updates.name.trim() === "") {
      throw new Error("School name cannot be empty");
    }
    await patchDefinedFields(ctx, "schools", school._id, updates);
    await logAuditEntry(ctx, school._id, "school.updateMySchool", updates);
    return school._id;
  },
});

// Superadmin: update any school by ID.
export const update = mutation({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("trial"),
    )),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requireSuperadmin(ctx);
    if (updates.primaryColor) assertValidHexColor(updates.primaryColor, "primaryColor");
    if (updates.secondaryColor) assertValidHexColor(updates.secondaryColor, "secondaryColor");
    await patchDefinedFields(ctx, "schools", id, updates);
    await logAuditEntry(ctx, id, "school.update", updates);
  },
});

// Superadmin: delete a school by ID.
export const remove = mutation({
  args: {
    id: v.id("schools"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, force }) => {
    await requireSuperadmin(ctx);

    const BATCH_SIZE = 100;

    // Check for active borrowings first (never force-delete these)
    const activeBorrowings = await ctx.db
      .query("borrowings")
      .withIndex("by_status", (q) => q.eq("schoolId", id).eq("status", "borrowed"))
      .take(1);
    if (activeBorrowings.length > 0) {
      throw new Error("Cannot delete school: active borrowings exist. Return all books first.");
    }

    // Check for classes
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (classes.length > 0 && !force) {
      throw new Error("Cannot delete school: classes still exist. Delete or reassign them first, or use force delete.");
    }

    // Check for students
    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
      .take(1);
    if (students.length > 0 && !force) {
      throw new Error("Cannot delete school: students still exist. Delete or reassign them first, or use force delete.");
    }

    if (force) {
      // Cascade: delete all students in this school
      let studentsBatch = await ctx.db
        .query("students")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
        .take(BATCH_SIZE);
      while (studentsBatch.length > 0) {
        for (let i = 0; i < studentsBatch.length; i++) {
          await ctx.db.delete(studentsBatch[i]._id);
        }
        studentsBatch = await ctx.db
          .query("students")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
          .take(BATCH_SIZE);
      }

      // Cascade: delete all classes (and their streams) in this school
      let classesBatch = await ctx.db
        .query("classes")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
        .take(BATCH_SIZE);
      while (classesBatch.length > 0) {
        for (let i = 0; i < classesBatch.length; i++) {
          const classId = classesBatch[i]._id;
          // Delete streams for this class
          let streamsBatch = await ctx.db
            .query("streams")
            .withIndex("by_classId", (q) => q.eq("classId", classId))
            .take(BATCH_SIZE);
          while (streamsBatch.length > 0) {
            for (let j = 0; j < streamsBatch.length; j++) {
              await ctx.db.delete(streamsBatch[j]._id);
            }
            streamsBatch = await ctx.db
              .query("streams")
              .withIndex("by_classId", (q) => q.eq("classId", classId))
              .take(BATCH_SIZE);
          }
          await ctx.db.delete(classId);
        }
        classesBatch = await ctx.db
          .query("classes")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", id))
          .take(BATCH_SIZE);
      }
    }

    await ctx.db.delete(id);
    await logAuditEntry(ctx, id, "school.remove", { force: !!force });
  },
});

// ── Delete school account (principal, DANGER: irreversible) ───────

/**
 * Tables owned by a school, mapped to the index (or "filter") used to
 * find that school's rows. Most tables carry a plain `by_schoolId` index;
 * a few use a composite schoolId-first index, and `fieldValues` has no
 * schoolId-prefixed index so it falls back to a filter.
 */
const SCHOOL_DATA_TABLES: Record<string, string> = {
  classes: "by_schoolId", streams: "by_schoolId", students: "by_schoolId",
  borrowings: "by_schoolId", books: "by_schoolId", members: "by_schoolId",
  subscriptions: "by_schoolId", webhook_events: "by_schoolId",
  feature_configurations: "by_schoolId", fines: "by_schoolId",
  fine_payments: "by_schoolId", fee_structures: "by_schoolId",
  fee_payments: "by_schoolId", report_logs: "by_schoolId", modules: "by_schoolId",
  sections: "by_schoolId", fields: "by_schoolId", fieldValues: "filter",
  records: "by_schoolId", roles: "by_schoolId",
  permissions: "by_schoolId_roleId", scopeRules: "by_schoolId",
  staffAssignments: "by_schoolId", analytics_snapshots: "by_schoolId",
  subjects: "by_schoolId", academicYears: "by_schoolId", terms: "by_schoolId",
  classAssignments: "by_schoolId", teachers: "by_schoolId",
  teacher_subjects: "by_schoolId", exams: "by_schoolId",
  exam_results: "by_schoolId", attendance: "by_schoolId",
  timetable_entries: "by_schoolId", events: "by_schoolId",
  inventory_items: "by_schoolId", health_records: "by_schoolId",
  clinic_visits: "by_schoolId_date", counseling_notes: "by_schoolId",
  discipline_incidents: "by_schoolId", promotion_history: "by_schoolId",
  student_documents: "by_schoolId", extracurricular_activities: "by_schoolId",
  student_activities: "by_schoolId", schemes_of_work: "by_schoolId",
  lesson_plans: "by_schoolId", duty_roster_entries: "by_schoolId_date",
  staff_attendance: "by_schoolId_date", leave_requests: "by_schoolId",
  appraisals: "by_schoolId", parent_meetings: "by_schoolId",
  book_holds: "by_schoolId", book_transfers: "by_schoolId",
  medical_supplies: "by_schoolId", vaccination_records: "by_schoolId",
  transport_routes: "by_schoolId", route_logs: "by_schoolId_date",
  vehicle_maintenance: "by_schoolId", visitor_log: "by_schoolId",
  gate_student_log: "by_schoolId_date", maintenance_tasks: "by_schoolId",
  admission_applications: "by_schoolId", expenditures: "by_schoolId",
  budgets: "by_schoolId", supplier_payments: "by_schoolId",
  correspondence: "by_schoolId", appointments: "by_schoolId",
  compliance_documents: "by_schoolId", board_meetings: "by_schoolId",
  announcements: "by_schoolId", guardians: "by_schoolId",
  notification_rules: "by_schoolId", notifications: "by_schoolId_status",
  onboarding_sessions: "by_schoolId", ai_sessions: "by_schoolId",
};

/** Impact summary shown to the principal BEFORE deleting (capped counts). */
export const getDeleteImpact = query({
  args: {},
  handler: async (ctx) => {
    const school = await requireSchoolFromJwt(ctx);
    await requirePrincipal(ctx, school._id);

    const CAP = 500;
    const capCount = async (table: string, index = "by_schoolId") => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (ctx.db.query(table as any) as any)
        .withIndex(index, (q: any) => q.eq("schoolId", school._id))
        .take(CAP);
      const n = rows.length;
      return n >= CAP ? `${n}+` : `${n}`;
    };

    const [students, classes, teachers, books, borrowings, exams, feePayments, members] =
      await Promise.all([
        capCount("students"), capCount("classes"), capCount("teachers"),
        capCount("books"), capCount("borrowings"), capCount("exams"),
        capCount("fee_payments"), capCount("members"),
      ]);

    return {
      schoolName: school.name,
      counts: { students, classes, teachers, books, borrowings, exams, feePayments, members },
    };
  },
});

/** Server-side guard: only a principal of the school may run deletion. */
export const verifyPrincipalForDeletion = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);
    return { ok: true };
  },
});

/**
 * Delete a batch of the school's data rows. Deletes up to a write budget
 * per call; the school row itself is removed once all data is gone.
 * Returns the number of rows deleted this call (0 = fully done).
 */
export const deleteSchoolDataBatch = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const BUDGET = 300;
    let deleted = 0;

    for (const [table, index] of Object.entries(SCHOOL_DATA_TABLES)) {
      if (deleted >= BUDGET) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = ctx.db.query(table as any) as any;
       
      const rows = index === "filter"
        ? await query.filter((q: any) => q.eq(q.field("schoolId"), schoolId)).take(BUDGET - deleted)
        : await query.withIndex(index, (q: any) => q.eq("schoolId", schoolId)).take(BUDGET - deleted);
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.delete(row._id as any);
        deleted++;
      }
    }

    if (deleted < BUDGET) {
      const links = await ctx.db
        .query("guardian_links")
        .filter((q) => q.eq(q.field("schoolId"), schoolId))
        .take(BUDGET - deleted);
      for (const row of links) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }

    if (deleted < BUDGET) {
      const audit = await ctx.db
        .query("platform_audit_logs")
        .withIndex("by_targetSchoolId", (q) => q.eq("targetSchoolId", schoolId))
        .take(BUDGET - deleted);
      for (const row of audit) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }

    // Everything is cleared — remove the school record itself.
    if (deleted === 0) {
      const school = await ctx.db.get(schoolId);
      if (school) {
        await ctx.db.delete(schoolId);
        deleted++;
      }
    }

    return { deleted };
  },
});

/**
 * Permanently delete the caller's school account and ALL of its data.
 * Principal-only, requires typing the school name to confirm.
 */
export const deleteMySchoolAccount = action({
  args: { confirmText: v.string() },
  handler: async (ctx, { confirmText }) => {
    const school = await ctx.runQuery(api.schools.getMySchool);
    if (!school) throw new Error("No school found for this account");
    if (confirmText.trim() !== school.name) {
      throw new Error("Confirmation must match the school name exactly");
    }

    await ctx.runMutation(internal.schools.verifyPrincipalForDeletion, {
      schoolId: school._id,
    });

    let safety = 0;
    while (true) {
      const { deleted } = await ctx.runMutation(internal.schools.deleteSchoolDataBatch, {
        schoolId: school._id,
      });
      if (deleted === 0) break;
      if (++safety > 2000) throw new Error("Deletion did not complete — try again");
    }

    // Best-effort: revoke the Clerk organization so the account can't sign
    // back into a deleted school. Fails safely if not configured.
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    const identity = await ctx.auth.getUserIdentity();
    const orgId = (identity as unknown as Record<string, unknown>)["org_id"] as string | undefined;
    let clerkOrgDeleted = false;
    if (clerkSecret && orgId) {
      try {
        const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${clerkSecret}` },
        });
        clerkOrgDeleted = res.ok;
      } catch (err) {
        console.error("[schools] Failed to delete Clerk org:", err);
      }
    }

    return { success: true, clerkOrgDeleted };
  },
});
