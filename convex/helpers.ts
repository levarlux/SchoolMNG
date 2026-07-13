import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

/**
 * JWT identity metadata shape.
 * Clerk stores custom metadata in `publicMetadata` on the JWT.
 */
interface JwtIdentity {
  subject: string;
  email?: string;
  org_id?: string;
  publicMetadata?: {
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

// ── Role helpers (read from JWT — never from client args) ──────────

function identityIsSuperadmin(identity: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  if (!identity) return false;
  const metadata = (identity as unknown as JwtIdentity)["publicMetadata"];
  return metadata?.role === "superadmin";
}

export async function isSuperadmin(ctx: Ctx) {
  const identity = await getCurrentUser(ctx);
  return identityIsSuperadmin(identity);
}

export async function requireSuperadmin(ctx: Ctx) {
  const identity = await requireAuth(ctx);
  if (!identityIsSuperadmin(identity)) throw new Error("Not authorized");
  return { userId: identity.subject, email: identity.email ?? "", role: "superadmin" } as Doc<"admins">;
}

// ── Tenant isolation ───────────────────────────────────────────────
//
// Every data mutation MUST call `requireSchoolMembership` or
// `requireSchoolIdFromJwt` before touching any table that carries a
// `schoolId` field.  This prevents cross-tenant access regardless of
// what the client sends.

/**
 * Extract the caller's Clerk org_id from the JWT.
 * Throws if the caller has no active organisation.
 */
export async function getOrgIdFromJwt(ctx: Ctx): Promise<string> {
  const identity = await requireAuth(ctx);
  const orgId = (identity as unknown as JwtIdentity)["org_id"];
  if (!orgId) throw new Error("No active organisation");
  return orgId;
}

/**
 * Resolve the school document that belongs to the caller's JWT org.
 * Returns the school doc or throws if not found.
 */
export async function requireSchoolFromJwt(ctx: Ctx): Promise<Doc<"schools">> {
  const orgId = await getOrgIdFromJwt(ctx);
  const school = await ctx.db
    .query("schools")
    .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
    .first();
  if (!school) throw new Error("School not found for this organisation");
  return school;
}

/**
 * Verify that the supplied schoolId matches the caller's JWT org.
 * Returns the verified school doc for reuse.  Call this at the top of
 * every handler that accepts a `schoolId` arg.
 */
export async function requireSchoolMembership(
  ctx: Ctx,
  schoolId: Id<"schools">,
): Promise<Doc<"schools">> {
  const orgId = await getOrgIdFromJwt(ctx);
  const school = await ctx.db.get(schoolId);
  if (!school) throw new Error("Not authorised for this school");
  if (school.clerkOrgId !== orgId) {
    throw new Error("Not authorised for this school");
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
  id: Id<"schools"> | Id<"classes"> | Id<"books"> | Id<"subscriptions"> | Id<"feature_configurations"> | Id<"students">,
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