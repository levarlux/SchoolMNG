import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * JWT identity metadata shape.
 * Clerk JWTs use snake_case (`public_metadata`), but some SDK versions
 * normalize to camelCase (`publicMetadata`). Check both.
 */
interface JwtIdentity {
  subject: string;
  email?: string;
  org_id?: string;
  publicMetadata?: {
    role?: string;
  };
  public_metadata?: {
    role?: string;
  };
}

// ── Auth primitives ────────────────────────────────────────────────

export async function getCurrentUser(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return identity;
}

export async function requireAuth(ctx: Ctx) {
  const identity = await getCurrentUser(ctx);
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

// ── Role helpers ────────────────────────────────────────────────────

function identityIsSuperadmin(identity: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  if (!identity) return false;
  const raw = identity as unknown as JwtIdentity;
  const role = raw.publicMetadata?.role ?? raw.public_metadata?.role;
  return role === "superadmin";
}

export async function isSuperadmin(ctx: Ctx) {
  const identity = await getCurrentUser(ctx);
  if (identityIsSuperadmin(identity)) return true;
  // Fallback: check admins table
  if (identity) {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();
    return admin?.role === "superadmin";
  }
  return false;
}

export async function requireSuperadmin(ctx: Ctx) {
  const identity = await requireAuth(ctx);
  if (identityIsSuperadmin(identity)) {
    return { userId: identity.subject, email: identity.email ?? "", role: "superadmin" } as Doc<"admins">;
  }
  // Fallback: check admins table
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();
  if (admin?.role === "superadmin") {
    return admin;
  }
  throw new Error("Not authorized");
}

// ── Tenant isolation ───────────────────────────────────────────────
//
// Every data mutation MUST call `requireSchoolMembership` or
// `requireSchoolIdFromJwt` before touching any table that carries a
// `schoolId` field.  This prevents cross-tenant access regardless of
// what the client sends.

// ── School role helpers ─────────────────────────────────────────────

type MemberRole = "teacher" | "principal" | string;
/**
 * Hierarchy of role keys recognised by auth gates.
 * The school's top leadership uses the stable key `principal` (renamable via
 * the `roles` table + `schools.leadershipTitle` for display).
 */
const ROLE_HIERARCHY: Record<string, number> = {
  teacher: 0,
  principal: 1,
};

/**
 * Resolve the school's configured leadership role key.
 * Currently this is the stable LEADERSHIP_ROLE_KEY ("principal"), which lets
 * us swap it centrally later if the key ever needs to change.
 */
import { LEADERSHIP_ROLE_KEY } from "./roles";  
const LEADERSHIP_KEY = LEADERSHIP_ROLE_KEY;

/**
 * Return the leadership role key used by auth gates.
 */
export function getLeadershipRoleKey(): string {
  return LEADERSHIP_KEY;
}

/**
 * True when the given member role key is this school's leadership role.
 * Fast path: the default key requires no extra read. For custom keys we check
 * the roles table's per-school `isLeadership` flag (P0#4), so a school may
 * promote any role to leadership without any hardcoded key.
 */
export async function isLeadershipRoleKey(
  ctx: Ctx,
  schoolId: Id<"schools">,
  roleKey: string | null
): Promise<boolean> {
  if (!roleKey) return false;
  if (roleKey === getLeadershipRoleKey()) return true;
  const role = await ctx.db
    .query("roles")
    .withIndex("by_schoolId_key", (q) =>
      q.eq("schoolId", schoolId).eq("key", roleKey)
    )
    .first();
  return role?.isLeadership === true;
}

/**
 * Look up the display name for the school's leadership role.
 * Reads the editable `name` from the `roles` table (seeded "Principal",
 * can be renamed to "Headteacher" etc.), falling back to the default.
 */
export async function getLeadershipRoleName(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<string> {
  const leadershipRole = await ctx.db
    .query("roles")
    .withIndex("by_schoolId_key", (q) =>
      q.eq("schoolId", schoolId).eq("key", LEADERSHIP_KEY)
    )
    .first();
  const roleName = leadershipRole?.name ?? "Principal";
  // Honour an override stored on the school itself (Phase 1.5 convenience).
  const school = await ctx.db.get(schoolId);
  if (school?.leadershipTitle) return school.leadershipTitle;
  return roleName;
}

/**
 * Look up the caller's member record for a school.
 * Returns null if the user has no member record (e.g. they're not a teacher).
 */
export async function getMemberRole(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<MemberRole | null> {
  const identity = await requireAuth(ctx);
  // Superadmins bypass role checks
  if (await isSuperadmin(ctx)) return LEADERSHIP_KEY;

  const member = await ctx.db
    .query("members")
    .withIndex("by_userId_and_schoolId", (q) =>
      q.eq("userId", identity.subject).eq("schoolId", schoolId)
    )
    .first();
  return member?.role ?? null;
}

/**
 * Require the caller to have at least the given role in the school.
 * Superadmins always pass.
 */
async function requireMinimumRole(
  ctx: Ctx,
  schoolId: Id<"schools">,
  minimum: MemberRole
): Promise<void> {
  const role = await getMemberRole(ctx, schoolId);
  if (!role) {
    throw new Error("You are not a member of this school");
  }
  // Leadership is resolved per-school (P0#4): a school may promote any role.
  const isLeader = await isLeadershipRoleKey(ctx, schoolId, role);
  const minWeight =
    minimum === LEADERSHIP_KEY ? 1 : ROLE_HIERARCHY[minimum] ?? 0;
  const roleWeight = isLeader ? 1 : ROLE_HIERARCHY[role] ?? 0;
  if (roleWeight < minWeight) {
    throw new Error(
      `${minimum} access required. Your role: ${role}`
    );
  }
}

/** Require teacher role or above (everyone). */
export async function requireTeacher(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<void> {
  await requireMinimumRole(ctx, schoolId, "teacher");
}

/** Require leadership role or above. */
export async function requirePrincipal(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<void> {
  await requireMinimumRole(ctx, schoolId, LEADERSHIP_KEY);
}

// ── Tenant isolation ───────────────────────────────────────────────

/**
 * Extract the caller's Clerk org_id from the JWT.
 * Returns null when the JWT lacks org_id (e.g. before Clerk integration is
 * fully configured), allowing callers to fall back gracefully.
 */
export async function getOrgIdFromJwt(ctx: Ctx): Promise<string | null> {
  const identity = await requireAuth(ctx);
  return (identity as unknown as JwtIdentity)["org_id"] ?? null;
}

/**
 * Resolve the school document that belongs to the caller's JWT org.
 * Returns the school doc or throws if not found.
 */
export async function requireSchoolFromJwt(ctx: Ctx): Promise<Doc<"schools">> {
  const orgId = await getOrgIdFromJwt(ctx);
  if (!orgId) throw new Error("No active organisation — select a school first");
  const school = await ctx.db
    .query("schools")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
    .first();
  if (!school) throw new Error("School not found for this organisation");
  return school;
}

/**
 * Verify that the supplied schoolId matches the caller's JWT org.
 * When org_id is missing from the JWT (Clerk integration not fully
 * configured), allows superadmins through (verified via admins table).
 */
export async function requireSchoolMembership(
  ctx: Ctx,
  schoolId: Id<"schools">,
): Promise<Doc<"schools">> {
  const orgId = await getOrgIdFromJwt(ctx);
  const school = await ctx.db.get(schoolId);
  if (!school) throw new Error("Not authorised for this school");

  // JWT has org_id — verify it matches the school
  if (orgId) {
    if (school.clerkOrgId !== orgId) {
      throw new Error("Not authorised for this school");
    }
    return school;
  }

  // No org_id in JWT — allow if user is superadmin (admins table fallback)
  const identity = await requireAuth(ctx);
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
    .first();
  if (admin?.role === "superadmin") return school;

  throw new Error("No active organisation — select a school first");
}

/**
 * Tenant isolation + active-status gate. Like requireSchoolMembership, but
 * also rejects members whose access is suspended (or revoked). Used by data
 * queries/mutations so a suspended member cannot read or write anything.
 */
export async function requireActiveMembership(
  ctx: Ctx,
  schoolId: Id<"schools">,
): Promise<Doc<"schools">> {
  const school = await requireSchoolMembership(ctx, schoolId);

  const identity = await requireAuth(ctx);
  const member = await ctx.db
    .query("members")
    .withIndex("by_userId_and_schoolId", (q) =>
      q.eq("userId", identity.subject).eq("schoolId", schoolId)
    )
    .first();
  if (member?.status === "suspended" || member?.status === "revoked") {
    throw new Error(
      member.statusMessage
        ? `Your access is ${member.status}: ${member.statusMessage}`
        : `Your access to this school is currently ${member.status}.`
    );
  }
  return school;
}

/**
 * For superadmin-only operations: verify superadmin OR membership.
 * Returns `{ isSuperadmin: boolean, school: Doc<"schools"> }`.
 */
export async function requireSuperadminOrMembership(
  ctx: Ctx,
  schoolId: Id<"schools">,
): Promise<{ superadmin: boolean; school: Doc<"schools"> }> {
  const identity = await requireAuth(ctx);
  const sa = identityIsSuperadmin(identity);
  if (sa) {
    const school = await ctx.db.get(schoolId);
    if (!school) throw new Error("School not found");
    return { superadmin: true, school };
  }
  const school = await requireSchoolMembership(ctx, schoolId);
  return { superadmin: false, school };
}

/**
 * Verify that a teacher/staff member belongs to the caller's school.
 * Looks up the teacher, then verifies the teacher's schoolId matches
 * the caller's JWT org.
 */
export async function requireTeacherMembership(
  ctx: Ctx,
  teacherId: Id<"teachers">,
): Promise<Doc<"teachers">> {
  const teacher = await ctx.db.get(teacherId);
  if (!teacher) throw new Error("Teacher not found");
  await requireSchoolMembership(ctx, teacher.schoolId);
  return teacher;
}

/**
 * Verify that a student belongs to the caller's school.
 * Looks up the student, then verifies the student's schoolId matches
 * the caller's JWT org.
 */
export async function requireStudentMembership(
  ctx: Ctx,
  studentId: Id<"students">,
): Promise<Doc<"students">> {
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student not found");
  await requireSchoolMembership(ctx, student.schoolId);
  return student;
}

/**
 * Verify that a class belongs to the caller's school.
 */
export async function requireClassMembership(
  ctx: Ctx,
  classId: Id<"classes">,
): Promise<Doc<"classes">> {
  const cls = await ctx.db.get(classId);
  if (!cls) throw new Error("Class not found");
  await requireSchoolMembership(ctx, cls.schoolId);
  return cls;
}

/**
 * Verify that a borrowing belongs to the caller's school.
 */
export async function requireBorrowingMembership(
  ctx: Ctx,
  borrowingId: Id<"borrowings">,
): Promise<Doc<"borrowings">> {
  const borrowing = await ctx.db.get(borrowingId);
  if (!borrowing) throw new Error("Borrowing not found");
  await requireSchoolMembership(ctx, borrowing.schoolId);
  return borrowing;
}

/**
 * Verify that a book belongs to the caller's school.
 */
export async function requireBookMembership(
  ctx: Ctx,
  bookId: Id<"books">,
): Promise<Doc<"books">> {
  const book = await ctx.db.get(bookId);
  if (!book) throw new Error("Book not found");
  await requireSchoolMembership(ctx, book.schoolId);
  return book;
}

// ── Input validation ───────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function assertValidHexColor(value: string, field: string) {
  if (!HEX_COLOR_RE.test(value)) {
    throw new Error(`Invalid hex colour for ${field}: "${value}". Expected "#rrggbb".`);
  }
}

// ── Reusable update pattern ────────────────────────────────────────
//
// Extracts the common "filter undefined fields then patch" pattern used
// across multiple mutation handlers.

/**
 * Filter out undefined keys from an updates object, then apply the patch
 * to the document with the given id.  Does nothing if all fields are undefined.
 *
 * Usage:
 *   await patchDefinedFields(ctx, tableName, docId, { name: "New", slug: undefined });
 */
export async function patchDefinedFields<T extends Record<string, unknown>>(
  ctx: MutationCtx,
  _table: string,
  id: Id<"schools"> | Id<"classes"> | Id<"books"> | Id<"subscriptions"> | Id<"feature_configurations"> | Id<"students"> | Id<"subjects"> | Id<"terms"> | Id<"teachers"> | Id<"teacher_subjects"> | Id<"exams"> | Id<"exam_results"> | Id<"attendance"> | Id<"timetable_entries"> | Id<"events"> | Id<"inventory_items"> | Id<"modules"> | Id<"sections"> | Id<"fields"> | Id<"records"> | Id<"fieldValues"> | Id<"roles"> | Id<"guardians">,
  updates: T,
): Promise<void> {
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([_, v]) => v !== undefined),
  );
  if (Object.keys(filtered).length > 0) {
    await ctx.db.patch(id as any, filtered);
  }
}

// ── Audit logging ──────────────────────────────────────────────────

/**
 * Insert an audit log entry into the report_logs table.
 * Should be called on any write operation (create, update, delete).
 */
export async function logAuditEntry(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
  action: string,
  details?: Record<string, unknown>,
) {
  const identity = await ctx.auth.getUserIdentity();
  await ctx.db.insert("report_logs", {
    schoolId,
    generatedBy: identity?.subject ?? "system",
    reportType: action,
    generatedAt: Date.now(),
    params: details,
  });
}

// ── EAV Permission helpers (Phase 0) ──────────────────────────────

/**
 * Resolve effective access for a role on a specific EAV node.
 * Walks up the tree: field → section → module.
 * Returns "none" if no permission found at any level.
 */
export async function resolveEffectiveAccess(
  ctx: Ctx,
  roleId: Id<"roles">,
  nodeType: "module" | "section" | "field",
  nodeId: string,
): Promise<"none" | "view" | "edit"> {
  // Direct permission lookup
  const direct = await ctx.db
    .query("permissions")
    .withIndex("by_roleId", (q) => q.eq("roleId", roleId))
    .filter((q) =>
      q.and(
        q.eq(q.field("nodeType"), nodeType),
        q.eq(q.field("nodeId"), nodeId),
      ),
    )
    .first();
  if (direct) return direct.access;

  // For fields, fall back to section → module
  if (nodeType === "field") {
    const field = await ctx.db.get(nodeId as any) as any;
    if (field && field.sectionId) {
      const sectionAccess = await resolveEffectiveAccess(ctx, roleId, "section", field.sectionId);
      if (sectionAccess !== "none") return sectionAccess;
      const section = await ctx.db.get(field.sectionId) as any;
      if (section && section.moduleId) {
        return await resolveEffectiveAccess(ctx, roleId, "module", section.moduleId);
      }
    }
  }

  // For sections, fall back to module
  if (nodeType === "section") {
    const section = await ctx.db.get(nodeId as any) as any;
    if (section && section.moduleId) {
      return await resolveEffectiveAccess(ctx, roleId, "module", section.moduleId);
    }
  }

  return "none";
}

/**
 * Require the caller to have at least `view` access on a node.
 * Throws if access is "none".
 */
export async function requireViewAccess(
  ctx: Ctx,
  roleId: Id<"roles">,
  nodeType: "module" | "section" | "field",
  nodeId: string,
): Promise<void> {
  const access = await resolveEffectiveAccess(ctx, roleId, nodeType, nodeId);
  if (access === "none") {
    throw new Error(`No access to ${nodeType} ${nodeId}`);
  }
}

/**
 * Require the caller to have `edit` access on a node.
 * Throws if access is "view" or "none".
 */
export async function requireEditAccess(
  ctx: Ctx,
  roleId: Id<"roles">,
  nodeType: "module" | "section" | "field",
  nodeId: string,
): Promise<void> {
  const access = await resolveEffectiveAccess(ctx, roleId, nodeType, nodeId);
  if (access !== "edit") {
    throw new Error(`Edit access required for ${nodeType} ${nodeId}. Current: ${access}`);
  }
}

// ── EAV field-level convenience helpers ──────────────────────────

/**
 * Resolve the caller's role document for a school from their member record.
 * Returns null if the caller has no member record.
 */
export async function getCallerRoleDoc(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<Doc<"roles"> | null> {
  const identity = await requireAuth(ctx);
  if (await isSuperadmin(ctx)) {
    // Superadmins get the leadership role
    const leaderRole = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", LEADERSHIP_KEY)
      )
      .first();
    return leaderRole ?? null;
  }
  const member = await ctx.db
    .query("members")
    .withIndex("by_userId_and_schoolId", (q) =>
      q.eq("userId", identity.subject).eq("schoolId", schoolId)
    )
    .first();
  if (!member) return null;
  return await ctx.db
    .query("roles")
    .withIndex("by_schoolId_key", (q) =>
      q.eq("schoolId", schoolId).eq("key", member.role)
    )
    .first();
}

/**
 * Require edit access on a specific field for the caller.
 * Resolves the caller's role from their membership, then checks field →
 * section → module permission cascade.
 */
export async function requireFieldEditAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  fieldId: Id<"fields">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireEditAccess(ctx, roleDoc._id, "field", fieldId as string);
}

/**
 * Require view access on a specific field for the caller.
 * Resolves the caller's role from their membership, then checks field →
 * section → module permission cascade.
 */
export async function requireFieldViewAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  fieldId: Id<"fields">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireViewAccess(ctx, roleDoc._id, "field", fieldId as string);
}

/**
 * Require edit access on a specific module for the caller.
 */
export async function requireModuleEditAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  moduleId: Id<"modules">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireEditAccess(ctx, roleDoc._id, "module", moduleId as string);
}

/**
 * Require view access on a specific module for the caller.
 */
export async function requireModuleViewAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  moduleId: Id<"modules">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireViewAccess(ctx, roleDoc._id, "module", moduleId as string);
}

/**
 * Require edit access on a specific section for the caller.
 */
export async function requireSectionEditAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  sectionId: Id<"sections">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireEditAccess(ctx, roleDoc._id, "section", sectionId as string);
}

/**
 * Require view access on a specific section for the caller.
 */
export async function requireSectionViewAccess(
  ctx: Ctx,
  schoolId: Id<"schools">,
  sectionId: Id<"sections">
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  await requireViewAccess(ctx, roleDoc._id, "section", sectionId as string);
}

// ── Module-by-name access helpers ─────────────────────────────────

/**
 * Look up a module by name for a school. Returns the module doc or null.
 */
async function getModuleByName(
  ctx: Ctx,
  schoolId: Id<"schools">,
  moduleName: string,
): Promise<Doc<"modules"> | null> {
  const modules = await ctx.db
    .query("modules")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(100);
  return modules.find((m) => m.name === moduleName) ?? null;
}

/**
 * Require the caller to have at least `view` access on a module by name.
 * Looks up the module by name for the school, then checks the caller's
 * role permissions on that module. Superadmins always pass.
 *
 * Usage:
 *   await requireModuleAccessByName(ctx, schoolId, "Finance");
 */
export async function requireModuleAccessByName(
  ctx: Ctx,
  schoolId: Id<"schools">,
  moduleName: string,
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  const mod = await getModuleByName(ctx, schoolId, moduleName);
  if (!mod) throw new Error(`Module "${moduleName}" not found`);
  await requireViewAccess(ctx, roleDoc._id, "module", mod._id as string);
}

/**
 * Require the caller to have `edit` access on a module by name.
 */
export async function requireModuleEditAccessByName(
  ctx: Ctx,
  schoolId: Id<"schools">,
  moduleName: string,
): Promise<void> {
  const roleDoc = await getCallerRoleDoc(ctx, schoolId);
  if (!roleDoc) throw new Error("No role found for this school");
  const mod = await getModuleByName(ctx, schoolId, moduleName);
  if (!mod) throw new Error(`Module "${moduleName}" not found`);
  await requireEditAccess(ctx, roleDoc._id, "module", mod._id as string);
}

// ── Database I/O optimization helpers ──────────────────────────────

/**
 * Efficiently count documents in a table filtered by schoolId.
 * Uses take(1) to check if any documents exist, avoiding full scans.
 * For accurate counts, use pagination or maintain a counter table.
 *
 * Note: Convex doesn't have a native count operation. This is a lightweight
 * approximation that avoids loading thousands of documents.
 * 
 * For accurate counts, consider maintaining a school_counters table
 * that increments/decrements on mutations.
 */
export async function getApproximateCount(
  ctx: QueryCtx,
  schoolId: Id<"schools">
): Promise<number> {
  // This is a placeholder - in production, use a counter table
  // or the aggregate component for accurate counts
  return 0;
}