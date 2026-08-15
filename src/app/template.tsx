import type { ReactNode } from "react";
import { PageTransition } from "@/components/page-transition";

/**
 * Root template — Phase 0.1.
 *
 * Unlike layout.tsx (which persists across navigations), a template remounts
 * on every route change. Wrapping children in PageTransition gives a reliable
 * fade-in on every navigation across the whole app — auth, onboarding,
 * dashboard, admin, dev-admin — with zero per-page changes.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
