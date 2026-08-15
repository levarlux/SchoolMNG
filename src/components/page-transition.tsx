"use client";

/**
 * PageTransition — Phase 0.1.
 *
 * Wraps children in a fade-in container keyed by pathname so every route
 * change replays the entrance animation (opacity 0 → 1, translateY(10px) → 0,
 * ~300ms ease-out). The animation is defined in globals.css (`.page-fade` /
 * `pageFadeIn`) and disabled for `prefers-reduced-motion` users there.
 *
 * Used by the root `src/app/template.tsx`, which Next.js remounts on every
 * navigation — so sign-in, sign-up, onboarding, dashboard, admin and dev-admin
 * all fade in with zero per-page changes.
 */
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-fade min-h-screen">
      {children}
    </div>
  );
}
