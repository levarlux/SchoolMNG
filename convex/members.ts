import { v } from "convex/values";
import { mutation, action, query, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAuth, requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";
import { LEADERSHIP_ROLE_KEY } from "./roles";
import { deleteClerkOrgMembership } from "./clerk";
import { Doc, Id } from "./_generated/dataModel";

const MEMBER_ROLES = v.string();

/**
 * Internal-only: look up a user's role in a school.
 * No auth check — used by action-level role verification that already checked auth.

 */
export const getRoleInternal = internalQuery({
  args: {
    userId: v.string(),
    schoolId: v.id("schools"),
  },
  handler: async (ctx, { userId, schoolId }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", userId).eq("schoolId", schoolId)
      )
      .first();
    return member?.role ?? null;
  },
});

/** Get the current user's member record for a school. */
export const getMyMembership = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", identity.subject).eq("schoolId", schoolId)
      )
      .first();
  },
});

/** List all members of a school (headteacher+ only). */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("members")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(500);
  },
});

/** Add a member to a school. Principal-only; can only assign "teacher" role. */
export const add = mutation({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
    role: MEMBER_ROLES,
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);

    if (args.role === LEADERSHIP_ROLE_KEY) {
      throw new Error("Cannot assign the leadership role through this method");
    }

    // Check for duplicates
    const existing = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", args.userId).eq("schoolId", args.schoolId)
      )
      .first();
    if (existing) {
      throw new Error("User is already a member of this school");
    }

    const memberId = await ctx.db.insert("members", args);
    await logAuditEntry(ctx, args.schoolId, "member.add", {
      memberId,
      userId: args.userId,
      role: args.role,
    });
    return memberId;
  },
});

/**
 * Internal-only: add a member from a Clerk webhook.
 * Idempotent — returns existing member if already present.
 * No auth required (called by webhook handler which verified the secret).
 */
export const addFromWebhook = internalMutation({
  args: {
    userId: v.string(),
    schoolId: v.id("schools"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    role: MEMBER_ROLES,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", args.userId).eq("schoolId", args.schoolId)
      )
      .first();
    if (existing) {
      return { ok: true, alreadyMember: true, memberId: existing._id };
    }

    const memberId = await ctx.db.insert("members", {
      userId: args.userId,
      schoolId: args.schoolId,
      role: args.role,
      email: args.email,
      name: args.name,
    });
    return { ok: true, alreadyMember: false, memberId };
  },
});

/** Update a member's role, optionally with a message the member sees in-app. */
export const updateRole = mutation({
  args: {
    memberId: v.id("members"),
    role: MEMBER_ROLES,
    message: v.optional(v.string()),
  },
  handler: async (ctx, { memberId, role, message }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await requirePrincipal(ctx, member.schoolId);

    // Prevent a head from changing their own role (self lockout).
    const identity = await requireAuth(ctx);
    if (member.userId === identity.subject) {
      throw new Error("You cannot change your own role — have another principal do it");
    }

    const prevRole = member.role;
    await ctx.db.patch(memberId, { role });
    await logAuditEntry(ctx, member.schoolId, "member.updateRole", {
      memberId,
      role,
      prevRole,
    });

    if (message) {
      await ctx.runMutation(api.notifications.send, {
        schoolId: member.schoolId,
        recipientId: member.userId,
        recipientRole: role,
        relatedRecordId: memberId,
        title: "Your role was updated",
        message: `${message} You now have the ${role} role.`,
      });
    }
  },
});

/**
 * Suspend (block access with a visible message) or reactivate a member.
 * Head-only. Cannot suspend the head themselves.
 */
export const setMemberStatus = mutation({
  args: {
    memberId: v.id("members"),
    status: v.union(v.literal("active"), v.literal("suspended")),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { memberId, status, message }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await requirePrincipal(ctx, member.schoolId);

    const identity = await requireAuth(ctx);
    if (member.userId === identity.subject) {
      throw new Error("You cannot change your own status");
    }

    await ctx.db.patch(memberId, {
      status,
      statusMessage: status === "active" ? undefined : message,
      statusUpdatedAt: Date.now(),
    });
    await logAuditEntry(ctx, member.schoolId, "member.setStatus", {
      memberId,
      status,
      message,
    });

    await ctx.runMutation(api.notifications.send, {
      schoolId: member.schoolId,
      recipientId: member.userId,
      recipientRole: member.role,
      relatedRecordId: memberId,
      title:
        status === "suspended"
          ? "Your access has been suspended"
          : "Your access has been restored",
      message:
        status === "suspended"
          ? (message ?? "The school head has suspended your access.")
          : (message ?? "The school head has restored your access."),
    });
  },
});

/** Remove a member row by id (no auth — internal). */
export const removeById = internalMutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) return { ok: false, reason: "Member not found" };
    await ctx.db.delete(memberId);
    return { ok: true };
  },
});

/** Internal-only: flag a member as revoked (used when Clerk removal fails). */
export const markRevokedStatus = internalMutation({
  args: {
    memberId: v.id("members"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { memberId, message }) => {
    await ctx.db.patch(memberId, {
      status: "revoked",
      statusMessage: message,
      statusUpdatedAt: Date.now(),
    });
  },
});

/** Internal-only: get a member row by id. */
export const getById = internalQuery({
  args: { id: v.id("members") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/** Internal-only: audit a revocation (used by the revokeMember action). */
export const logRevokeAudit = internalMutation({
  args: {
    schoolId: v.id("schools"),
    memberId: v.id("members"),
    userId: v.string(),
    actingUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await logAuditEntry(ctx, args.schoolId, "member.revoke", {
      memberId: args.memberId,
      userId: args.userId,
      actingUserId: args.actingUserId,
    });
  },
});

async function revokeCore(
  ctx: ActionCtx,
  memberId: Id<"members">,
  actingUserId: string
) {
  const member: Doc<"members"> | null = await ctx.runQuery(internal.members.getById, {
    id: memberId,
  });
  if (!member) throw new Error("Member not found");
  if (member.userId === actingUserId) {
    throw new Error("You cannot revoke your own access");
  }

  const school: Doc<"schools"> | null = await ctx.runQuery(internal.schools.getById, {
    id: member.schoolId,
  });
  if (!school) throw new Error("School not found");

  // Remove the Clerk org membership so they lose school access entirely.
  let clerkRemoved = true;
  try {
    await deleteClerkOrgMembership(school.clerkOrgId, member.userId);
  } catch {
    clerkRemoved = false;
  }

  if (clerkRemoved) {
    await ctx.runMutation(internal.members.removeById, { memberId });
  } else {
    // Clerk deletion failed — keep the member row flagged `revoked` so the
    // active-membership gate still blocks this user from any data access.
    await ctx.runMutation(internal.members.markRevokedStatus, {
      memberId,
      message: "Your access has been revoked.",
    });
  }
  await ctx.runMutation(internal.members.logRevokeAudit, {
    schoolId: member.schoolId,
    memberId,
    userId: member.userId,
    actingUserId,
  });

  // Tell the user what happened (they may still be logged in until Clerk syncs).
  await ctx.runMutation(api.notifications.send, {
    schoolId: member.schoolId,
    recipientId: member.userId,
    recipientRole: member.role,
    relatedRecordId: memberId,
    title: "Your access has been revoked",
    message: "The school head has revoked your access to this school.",
  });
}

/**
 * Revoke a member's access entirely: removes their Clerk org membership
 * (kicks them out of the school) and deletes the member record. Head-only.
 */
export const revokeMember = action({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const member: Doc<"members"> | null = await ctx.runQuery(internal.members.getById, {
      id: memberId,
    });
    if (!member) throw new Error("Member not found");

    const callerRole = await ctx.runQuery(internal.members.getRoleInternal, {
      userId: identity.subject,
      schoolId: member.schoolId,
    });
    if (callerRole !== LEADERSHIP_ROLE_KEY) {
      throw new Error("Only the school head can revoke access");
    }

    await revokeCore(ctx, memberId, identity.subject);
    return { ok: true };
  },
});

/** Remove a member from a school. */
export const remove = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await requirePrincipal(ctx, member.schoolId);

    await ctx.db.delete(memberId);
    await logAuditEntry(ctx, member.schoolId, "member.remove", {
      memberId,
      userId: member.userId,
    });
  },
});

/** Mark the onboarding tour as seen for the caller's membership. */
export const markTourSeen = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", identity.subject).eq("schoolId", schoolId)
      )
      .first();
    if (member) {
      await ctx.db.patch(member._id, { hasSeenTour: true });
    }
  },
});
