import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return identity;
}

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await getCurrentUser(ctx);
  if (!identity) throw new Error("Not authenticated");
  return identity;
}

/** Check Clerk publicMetadata.role from the JWT claim (no DB lookup needed). */
function identityIsSuperadmin(identity: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  if (!identity) return false;
  const metadata = (identity as Record<string, unknown>)["publicMetadata"] as
    | { role?: string }
    | undefined;
  return metadata?.role === "superadmin";
}

export async function isSuperadmin(ctx: QueryCtx | MutationCtx) {
  const identity = await getCurrentUser(ctx);
  return identityIsSuperadmin(identity);
}

export async function requireSuperadmin(ctx: QueryCtx | MutationCtx) {
  const identity = await requireAuth(ctx);
  if (!identityIsSuperadmin(identity)) throw new Error("Not authorized");
  // Return a synthetic admin-like object so callers that type-check on Doc<"admins"> still work.
  return { userId: identity.subject, email: identity.email ?? "", role: "superadmin" } as Doc<"admins">;
}
