"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "convex/_generated/api";
import { useUser } from "@clerk/nextjs";

export function useAdmin() {
  const { user } = useUser();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const admin = useQuery(
    api.admins.getByUserId,
    !isLoading && isAuthenticated && user?.id ? { userId: user.id } : "skip"
  );
  return admin ?? null;
}

export function useIsSuperadmin() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return undefined;
  return (user?.publicMetadata as { role?: string } | undefined)?.role === "superadmin";
}
