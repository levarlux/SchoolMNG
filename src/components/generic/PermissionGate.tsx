"use client";

import { ReactNode } from "react";
import { useRole, isLeadershipRole } from "@/lib/use-role";

interface PermissionGateProps {
  children: ReactNode;
  requiredRole?: string;
  fallback?: ReactNode;
}

/**
 * Wraps content and only renders it if the user has the required role.
 * Leadership role (key "principal", renameable) always has access.
 */
export function PermissionGate({
  children,
  requiredRole = "principal",
  fallback = null,
}: PermissionGateProps) {
  const role = useRole();

  // Leadership has access to everything
  if (isLeadershipRole(role) || role === requiredRole) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
