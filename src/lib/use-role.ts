"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "./use-school";

export type MemberRole = "teacher" | "principal";

/**
 * Returns the current user's role within the active school.
 *
 * Reads from Clerk publicMetadata (fast) AND the Convex members table
 * (authoritative). The Convex record takes precedence when available.
 *
 * - `undefined` = still loading
 * - `null` = no membership found (not a member of this school)
 * - `"teacher"` | `"principal"` = the role
 */
export function useRole(): MemberRole | null | undefined {
  const { user, isLoaded } = useUser();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const school = useSchool();

  // Fast path: read from Clerk publicMetadata
  const clerkRole = isLoaded
    ? ((user?.publicMetadata as { schoolRole?: string } | undefined)?.schoolRole as MemberRole | undefined)
    : undefined;

  // Authoritative path: read from Convex members table
  const member = useQuery(
    api.members.getMyMembership,
    !authLoading && isAuthenticated && school
      ? { schoolId: school._id }
      : "skip"
  );

  // Still loading
  if (!isLoaded || authLoading || member === undefined) {
    return undefined;
  }

  // Convex record takes precedence
  if (member?.role) {
    return member.role as MemberRole;
  }

  // Fallback to Clerk metadata
  if (clerkRole) {
    return clerkRole;
  }

  // No membership found
  return null;
}

/**
 * Role hierarchy check helpers.
 */
const ROLE_HIERARCHY: Record<MemberRole, number> = {
  teacher: 0,
  principal: 1,
};

export function isAtLeast(role: MemberRole | null | undefined, minimum: MemberRole): boolean {
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimum];
}
