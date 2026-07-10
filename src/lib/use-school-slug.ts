"use client";

import { useMemo } from "react";

export function useSchoolSlug(): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const host = window.location.host;
    const parts = host.split(".");
    if (parts.length >= 3) {
      return parts[0];
    }
    return null;
  }, []);
}
