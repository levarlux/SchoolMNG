import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendClerkOrgInvitation } from "./clerk";

export const sendInvitation = action({
  args: {
    schoolId: v.id("schools"),
    email: v.string(),
    role: v.union(v.literal("teacher"), v.literal("principal")),
  },
  handler: async (ctx, { schoolId, email, role }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    if (role === "principal") {
      throw new Error("Cannot invite users with principal role");
    }

    const callerRole = await ctx.runQuery(internal.members.getRoleInternal, {
      userId: identity.subject,
      schoolId,
    });
    if (callerRole !== "principal") {
      throw new Error("Only principals can invite members");
    }

    const school = await ctx.runQuery(internal.schools.getById, { id: schoolId });
    if (!school) throw new Error("School not found");

    const invitation = await sendClerkOrgInvitation(
      school.clerkOrgId,
      email,
      { appRole: role }
    );

    return { invitationId: invitation.id, email, role };
  },
});
