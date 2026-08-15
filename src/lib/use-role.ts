"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "./use-school";

/**
 * Stable role keys. The leadership role key is "principal" (renameable display
 * name lives in the roles table + schools.leadershipTitle).
 */
export type MemberRole = string;
export const LEADERSHIP_ROLE_KEY = "principal";
export const TEACHER_ROLE_KEY = "teacher";

export function isLeadershipRole(role: MemberRole | null | undefined): boolean {
  if (!role) return false;
  return role === LEADERSHIP_ROLE_KEY;
}

export function isAtLeastRole(
  role: MemberRole | null | undefined,
  minimum: MemberRole
): boolean {
  if (!role) return false;
  if (role === LEADERSHIP_ROLE_KEY) return true; // leadership has all access
  if (role === TEACHER_ROLE_KEY && minimum === TEACHER_ROLE_KEY) return true;
  return role === minimum;
}

/**
 * Returns the current user's role within the active school.
 *
 * Reads from Clerk publicMetadata (fast) AND the Convex members table
 * (authoritative). The Convex record takes precedence when available.
 *
 * - `undefined` = still loading
 * - `null` = no membership found (not a member of this school)
 * - string = the role key (e.g. "principal", "teacher")
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
