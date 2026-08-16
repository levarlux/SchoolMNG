import { v } from "convex/values";
import { action, query, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { sendClerkOrgInvitation, revokeClerkOrgInvitation } from "./clerk";
import { LEADERSHIP_ROLE_KEY } from "./roles";
import { Doc, Id } from "./_generated/dataModel";

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

async function assertHead(
  ctx: ActionCtx,
  schoolId: Id<"schools">
): Promise<{ userId: string; email: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const isLeader = await ctx.runQuery(internal.members.isLeaderInternal, {
    userId: identity.subject,
    schoolId,
  });
  if (!isLeader) {
    throw new Error("Only the school head can invite or manage members");
  }
  return { userId: identity.subject, email: identity.email ?? "" };
}

// ── Internal helpers (called from actions + webhooks) ───────────────

export const insertRow = internalMutation({
  args: {
    schoolId: v.id("schools"),
    email: v.string(),
    role: v.string(),
    roleName: v.string(),
    clerkInvitationId: v.string(),
    invitedBy: v.string(),
    invitedByEmail: v.optional(v.string()),
    createdAt: v.float64(),
    expiresAt: v.float64(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invitations", { ...args, status: "pending" });
  },
});

export const getPendingByEmail = internalQuery({
  args: { schoolId: v.id("schools"), email: v.string() },
  handler: async (ctx, { schoolId, email }) => {
    return await ctx.db
      .query("invitations")
      .withIndex("by_email_schoolId", (q) =>
        q.eq("email", email).eq("schoolId", schoolId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();
  },
});

export const getById = internalQuery({
  args: { id: v.id("invitations") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const markRevoked = internalMutation({
  args: { id: v.id("invitations"), revokedAt: v.float64() },
  handler: async (ctx, { id, revokedAt }) => {
    await ctx.db.patch(id, { status: "revoked", revokedAt });
  },
});

export const refreshPending = internalMutation({
  args: {
    id: v.id("invitations"),
    clerkInvitationId: v.string(),
    createdAt: v.float64(),
    expiresAt: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      clerkInvitationId: args.clerkInvitationId,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

/** Mark an invite accepted and notify the inviting head. Used by the webhook. */
export const markAccepted = internalMutation({
  args: {
    id: v.id("invitations"),
    acceptedAt: v.float64(),
  },
  handler: async (ctx, { id, acceptedAt }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status === "accepted") return;
    await ctx.db.patch(id, { status: "accepted", acceptedAt });

    await ctx.runMutation(api.notifications.send, {
      schoolId: row.schoolId,
      recipientId: row.invitedBy,
      recipientRole: LEADERSHIP_ROLE_KEY,
      relatedRecordId: id,
      title: "Invitation accepted",
      message: `${row.email} accepted the ${row.roleName} invitation and joined your school.`,
    });
  },
});

// ── Public surface ──────────────────────────────────────────────────

/**
 * Invite a person to the school by email with a specific role.
 * The invitation email (with account-creation / acceptance) is sent by
 * Clerk; the local `invitations` row tracks the invite for the head's
 * management UI and the acceptance notification.
 */
export const sendInvitation = action({
  args: {
    schoolId: v.id("schools"),
    email: v.string(),
    role: v.string(),
  },
  handler: async (
    ctx,
    { schoolId, email, role }
  ): Promise<{ ok: boolean; email: string; role: string; roleName: string }> => {
    const head = await assertHead(ctx, schoolId);
    const normalizedEmail = email.trim().toLowerCase();

    if (role === LEADERSHIP_ROLE_KEY) {
      throw new Error("Invite someone with another role — the leadership role cannot be invited");
    }

    // Also block per-school promoted leadership roles (P0#4).
    const targetIsLeader = await ctx.runQuery(internal.roles.isLeadershipByKey, {
      schoolId,
      key: role,
    });
    if (targetIsLeader) {
      throw new Error("Invite someone with another role — the leadership role cannot be invited");
    }

    const school = await ctx.runQuery(internal.schools.getById, { id: schoolId });
    if (!school) throw new Error("School not found");

    // Validate the role exists in this school's roles table.
    const roleDoc: Doc<"roles"> | null = await ctx.runQuery(internal.roles.getByKey, {
      schoolId,
      key: role,
    });
    if (!roleDoc) {
      throw new Error("That role does not exist in this school. Create it first in Settings → Roles.");
    }

    // No duplicate pending invite for the same address.
    const existing: Doc<"invitations"> | null = await ctx.runQuery(
      internal.invitations.getPendingByEmail,
      {
        schoolId,
        email: normalizedEmail,
      }
    );
    if (existing) {
      throw new Error(
        `${normalizedEmail} already has a pending invitation (${existing.roleName}). Revoke it first to re-invite.`
      );
    }

    const invitation = await sendClerkOrgInvitation(school.clerkOrgId, normalizedEmail, {
      appRole: role,
    });

    const now = Date.now();
    await ctx.runMutation(internal.invitations.insertRow, {
      schoolId,
      email: normalizedEmail,
      role,
      roleName: roleDoc.name,
      clerkInvitationId: invitation.id,
      invitedBy: head.userId,
      invitedByEmail: head.email,
      createdAt: now,
      expiresAt: now + INVITATION_TTL_MS,
    });

    return { ok: true, email: normalizedEmail, role, roleName: roleDoc.name };
  },
});

/** List invitations for the head's management UI. Head-only. */
export const listInvitations = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const isLeader = await ctx.runQuery(internal.members.isLeaderInternal, {
      userId: identity.subject,
      schoolId,
    });
    if (!isLeader) {
      throw new Error("Only the school head can view invitations");
    }
    return await ctx.db
      .query("invitations")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("desc")
      .take(100);
  },
});

/** Revoke a pending invitation. Head-only. */
export const revokeInvitation = action({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }): Promise<{ ok: boolean }> => {
    const row: Doc<"invitations"> | null = await ctx.runQuery(
      internal.invitations.getById,
      { id: invitationId }
    );
    if (!row) throw new Error("Invitation not found");
    await assertHead(ctx, row.schoolId);

    if (row.status === "accepted") {
      throw new Error("This invitation was already accepted — revoke the member instead");
    }
    if (row.status === "revoked") {
      return { ok: true };
    }

    if (row.clerkInvitationId) {
      const school: Doc<"schools"> | null = await ctx.runQuery(internal.schools.getById, {
        id: row.schoolId,
      });
      if (school) {
        await revokeClerkOrgInvitation(school.clerkOrgId, row.clerkInvitationId).catch(() => {
          // Best-effort: Clerk may have already consumed it (user accepted).
        });
      }
    }

    await ctx.runMutation(internal.invitations.markRevoked, {
      id: invitationId,
      revokedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Resend a pending invitation (fresh Clerk invite, refreshed expiry). Head-only. */
export const resendInvitation = action({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, { invitationId }): Promise<{ ok: boolean }> => {
    const row: Doc<"invitations"> | null = await ctx.runQuery(
      internal.invitations.getById,
      { id: invitationId }
    );
    if (!row) throw new Error("Invitation not found");
    await assertHead(ctx, row.schoolId);

    if (row.status !== "pending") {
      throw new Error("Only pending invitations can be resent");
    }

    const school: Doc<"schools"> | null = await ctx.runQuery(internal.schools.getById, {
      id: row.schoolId,
    });
    if (!school) throw new Error("School not found");

    const invitation = await sendClerkOrgInvitation(school.clerkOrgId, row.email, {
      appRole: row.role,
    });

    const now = Date.now();
    await ctx.runMutation(internal.invitations.refreshPending, {
      id: invitationId,
      clerkInvitationId: invitation.id,
      createdAt: now,
      expiresAt: now + INVITATION_TTL_MS,
    });
    return { ok: true };
  },
});

export type InvitationRow = Doc<"invitations">;
