/**
 * Reusable hooks for cost optimization and performance.
 *
 * - useLazyQuery: Pauses WebSocket subscriptions when the browser tab is hidden
 * - useScopedQuery: Enforces schoolId scoping to prevent accidental full-table reads
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import type { FunctionReference } from "convex/server";

// ── Visibility-aware query ──────────────────────────────────────
/**
 * Wraps `useQuery` so that the subscription is paused when the browser
 * tab is hidden (`document.visibilityState !== "visible"`).
 *
 * This saves WebSocket bandwidth and compute when the user is on
 * another tab or has the window minimised.
 *
 * @example
 * ```tsx
 * const students = useLazyQuery(api.students.listBySchool, { schoolId });
 * ```
 */
export function useLazyQuery<Args extends Record<string, unknown>>(
  queryRef: FunctionReference<"query">,
  args: Args | "skip",
) {
  const [visible, setVisible] = useState(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true,
  );

  useEffect(() => {
    const handler = () => {
      setVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return useQuery(queryRef, visible ? args : "skip");
}

// ── Scoped query (school-level) ─────────────────────────────────
/**
 * Enforces that every school-level query receives a `schoolId`.
 * Returns `"skip"` when no school is available, preventing
 * accidental full-table scans.
 *
 * @example
 * ```tsx
 * const school = useSchool();
 * const students = useScopedQuery(api.students.listBySchool, school?._id);
 * ```
 */
export function useScopedQuery<Args extends Record<string, unknown>>(
  queryRef: FunctionReference<"query">,
  schoolId: string | undefined,
  extraArgs?: Omit<Args, "schoolId">,
) {  const args = schoolId
    ? ({ schoolId, ...extraArgs } as unknown as Args)
    : ("skip" as const);

  return useQuery(queryRef, args);
}

// ── Lazy scoped query (visibility + school scoping) ─────────────
/**
 * Combines `useLazyQuery` and `useScopedQuery` — pauses when hidden
 * AND enforces school scoping. The best of both worlds.
 */
export function useLazyScopedQuery<Args extends Record<string, unknown>>(
  queryRef: FunctionReference<"query">,
  schoolId: string | undefined,
  extraArgs?: Omit<Args, "schoolId">,
) {
  const [visible, setVisible] = useState(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true,
  );

  useEffect(() => {
    const handler = () => {
      setVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const args =
    schoolId && visible
      ? ({ schoolId, ...extraArgs } as unknown as Args)
      : ("skip" as const);

  return useQuery(queryRef, args);
}

// ── Paginated query with lazy loading ───────────────────────────
/**
 * Wraps `usePaginatedQuery` with visibility awareness and school scoping.
 * Pauses loading more items when the tab is hidden.
 */
export function useLazyPaginatedQuery<Args extends Record<string, unknown>>(
  queryRef: FunctionReference<"query">,
  schoolId: string | undefined,
  extraArgs?: Omit<Args, "schoolId">,
  initialNumItems = 20,
) {
  const [visible, setVisible] = useState(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true,
  );

  useEffect(() => {
    const handler = () => {
      setVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const args =
    schoolId && visible
      ? ({ schoolId, ...extraArgs } as unknown as Args)
      : ("skip" as const);

  return usePaginatedQuery(queryRef as any, args, { initialNumItems });
}
