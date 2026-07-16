"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchoolSlug } from "./use-school-slug";
import { useOrganization } from "@clerk/clerk-react";

export function useSchool() {
  const slug = useSchoolSlug();
  const { organization } = useOrganization();
  const { isAuthenticated, isLoading } = useConvexAuth();

  // Primary: server reads org_id from JWT — never mismatches
  const schoolByJwt = useQuery(
    api.schools.getMySchool,
    !isLoading && isAuthenticated ? {} : "skip"
  );

  // Fallback: Clerk's own org context (works even if JWT refresh is flaky)
  const schoolByOrg = useQuery(
    api.schools.getByClerkOrgId,
    organization?.id ? { clerkOrgId: organization.id } : "skip"
  );

  // Last resort: subdomain-based lookup (for multi-tenant public URLs)
  const schoolBySlug = useQuery(
    api.schools.getBySlug,
    slug ? { slug } : "skip"
  );

  return schoolByJwt ?? schoolByOrg ?? schoolBySlug ?? null;
}
