"use client";

import { ReactNode } from "react";

// Theme injection for the dashboard is handled by DashboardLayout directly,
// which has guaranteed access to the school's Convex data.
// This provider is kept as a shell for any future public-page theming needs.
export function SchoolThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
