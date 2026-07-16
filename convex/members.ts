import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireSchoolMembership, logAuditEntry } from "./helpers";

const MEMBER_ROLES = v.union(
  v.literal("teacher"),
  v.literal("principal"),
);

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

/** Add a member to a school. Defaults to "teacher" role. */
export const add = mutation({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
    role: MEMBER_ROLES,
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

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

/** Update a member's role. */
export const updateRole = mutation({
  args: {
    memberId: v.id("members"),
    role: MEMBER_ROLES,
  },
  handler: async (ctx, { memberId, role }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await requireSchoolMembership(ctx, member.schoolId);

    await ctx.db.patch(memberId, { role });
    await logAuditEntry(ctx, member.schoolId, "member.updateRole", {
      memberId,
      role,
    });
  },
});

/** Remove a member from a school. */
export const remove = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found");
    await requireSchoolMembership(ctx, member.schoolId);

    await ctx.db.delete(memberId);
    await logAuditEntry(ctx, member.schoolId, "member.remove", {
      memberId,
      userId: member.userId,
    });
  },
});
