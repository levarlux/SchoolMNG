"use client";

import { useMemo } from "react";

export function useSchoolSlug(): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;

    // Desktop: check localStorage (set by school selector)
    const stored = localStorage.getItem("desktop_school_slug");
    if (stored) return stored;

    // Web: extract from subdomain
    const host = window.location.host;
    const parts = host.split(".");
    if (parts.length >= 3) {
      return parts[0];
    }

    return null;
  }, []);
}

export function setDesktopSchoolSlug(slug: string): void {
  localStorage.setItem("desktop_school_slug", slug);
}

export function clearDesktopSchoolSlug(): void {
  localStorage.removeItem("desktop_school_slug");
}
