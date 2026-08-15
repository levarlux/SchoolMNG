# Convex Cost Optimization & Data Migration Audit Report

**Date:** 11 August 2026  
**Auditor:** Buffy (AI Infrastructure Architect)  
**Scope:** Full SchoolMNG Convex backend + frontend subscription patterns + data ingestion pipelines  

---

## Executive Summary

SchoolMNG has **113 database tables**, **268 indexes**, and **200+ reactive queries**. The codebase shows good fundamentals (indexed queries, `take()` limits, `schoolId` scoping) but has significant cost and performance opportunities across 6 domains.

**Overall Score:** ⚠️ **Needs Optimization** — several high-impact issues that will cause bill spikes as data grows.

---

## Domain 1: Real-Time Subscription & Listener Scope

### 🔴 Critical: Dashboard loads ALL data on mount

**`src/app/dashboard/page.tsx`** — The main dashboard fires **5 simultaneous useQuery calls** on mount:
```tsx
const allBorrowings = useQuery(api.borrowings.listBySchool, school ? { schoolId: school._id } : "skip");
const students = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
const books = useQuery(api.books.listBySchool, school ? { schoolId: school._id } : "skip");
const subscription = useQuery(api.billing.getMySubscription);
```

**Impact:** Every user who lands on the dashboard immediately opens 5 WebSocket subscriptions, each pulling potentially thousands of documents. For a school with 5,000 students, that's 5,000+ documents streamed just for the students query alone.

**Fix:** Replace full-list queries with aggregate/stats queries:
```tsx
// BEFORE: Fetches ALL students
const students = useQuery(api.students.listBySchool, { schoolId });

// AFTER: Fetches only the count + summary stats
const dashboardStats = useQuery(api.dashboardStats.getSummary, { schoolId });
```

### 🔴 Critical: No visibility-based subscription management

**Finding:** Zero occurrences of `document.visibilityState` or `visibilitychange` in the codebase.

**Impact:** When users switch to another browser tab, all WebSocket subscriptions remain active, continuously syncing data that nobody is viewing. On mobile devices, this drains battery and wastes bandwidth.

**Fix:** Implement a `useVisibilityQuery` wrapper:
```tsx
function useLazyQuery(fn, args) {
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
  return useQuery(fn, visible ? args : "skip");
}
```

### 🟡 Medium: Admin pages fetch unbounded school lists

**`src/app/admin/schools/page.tsx`, `src/app/admin/subscriptions/page.tsx`** — Both call `useQuery(api.schools.list)` which returns up to 500 schools with full documents.

**Impact:** Platform admins see every school's full data loaded reactively. As the platform grows, this becomes a cost bottleneck.

---

## Domain 2: Schema Indexing & Scanning Reduction

### 🔴 Critical: Unbounded `.collect()` calls (43 instances)

**Top offenders by file:**

| File | `.collect()` calls | Risk |
|------|-------------------|------|
| `convex/guardianLinks.ts` | 5 | High — could load all links for a school |
| `convex/expenditures.ts` | 5 | High — financial data accumulation |
| `convex/ocr.ts` | 4 | High — loads all modules/sections/fields |
| `convex/guardians.ts` | 4 | Medium — typically bounded by school |
| `convex/notifications.ts` | 3 | Medium — notification history grows fast |
| `convex/announcements.ts` | 2 | Low — typically bounded |
| `convex/admissions.ts` | 2 | Low — typically bounded |

**Fix pattern:**
```ts
// BEFORE: Unbounded
const allLinks = await ctx.db.query("guardian_links").collect();

// AFTER: Scoped and limited
const links = await ctx.db
  .query("guardian_links")
  .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
  .take(100);
```

### 🟡 Medium: Some `.filter()` calls after `.take()` (post-fetch filtering)

**`convex/admissions.ts:13`** — Filters by status after fetching:
```ts
let results = await q.collect();
if (args.status) {
  results = results.filter((a) => a.status === args.status);
}
```

**Fix:** Add a `by_schoolId_status` index and filter in the query:
```ts
.withIndex("by_schoolId_status", (q) => 
  q.eq("schoolId", args.schoolId).eq("status", args.status))
```

### ✅ Good: Index coverage is strong

**268 indexes across 113 tables** — averaging 2.4 indexes per table. Most multi-tenant queries properly use `by_schoolId` indexes.

---

## Domain 3: Data Pagination & Payload Minimization

### 🔴 Critical: Zero `usePaginatedQuery` usage

**Finding:** The codebase has **zero** instances of `usePaginatedQuery` or `useInfiniteQuery`.

**Impact:** Every list (students, books, borrowings, etc.) loads the full result set into memory. For a school with 5,000 students, the student list query returns all 5,000 documents at once.

**Fix for student list (most common):**
```tsx
// BEFORE: All students at once
const allStudents = useQuery(api.students.listBySchool, { schoolId });

// AFTER: Paginated (20 at a time)
const { results, status, loadMore } = usePaginatedQuery(
  api.students.listBySchoolPaginated, 
  { schoolId },
  { initialNumItems: 20 }
);
```

### 🟡 Medium: Large take() limits in analytics

**`convex/analytics.ts`** — Uses `.take(50000)` for system overview:
```ts
ctx.db.query("students").take(50000),
ctx.db.query("books").take(50000),
ctx.db.query("borrowings").take(50000),
```

**Impact:** These queries read up to 50,000 documents each, even if the school only has 100 students. The cost scales with the global table size, not the school's data.

**Fix:** Always scope by `schoolId` with an index:
```ts
ctx.db.query("students")
  .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
  .take(10000),
```

---

## Domain 4: Action vs. Mutation vs. HTTP Route Separation

### ✅ Good: Actions used for external API calls

- `convex/billing.ts` — `cancelSubscription` is an action (calls Paystack API) ✓
- `convex/paystack.ts` — `initializeCheckout` is an action ✓
- `convex/aiAssistant.ts` — `chat` is an action (calls Claude API) ✓

### 🟡 Medium: Heavy queries could be actions

**`convex/comprehensiveReports.ts`** — `getSchoolOverview` is a query that reads from **30+ tables** in a single function. This hits Convex's execution time limits for large schools.

**Fix:** Convert to an action that caches results:
```ts
export const getSchoolOverview = action({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    // Run parallel queries as actions (not blocked by mutation limits)
    const data = await ctx.runQuery(internal.comprehensiveReports.getSchoolOverviewData, {
      schoolId: args.schoolId,
    });
    return data;
  },
});
```

---

## Domain 5: File & Asset Storage Strategy

### ✅ Good: Convex File Storage used correctly

- `convex/files.ts` — `generateUploadUrl` returns a signed URL ✓
- Files are uploaded directly to Convex storage, not stored as base64 ✓
- `storage.getUrl()` used for retrieval ✓

### 🔴 Critical: No client-side compression before upload

**Finding:** No `pako`, `fflate`, or any compression library in the codebase. Files are uploaded at full size.

**Impact:** A 10MB PDF or image uploads at full 10MB. With compression, most documents could be 30-70% smaller.

**Fix:** Add compression before upload:
```tsx
import { compress } from 'fflate';

async function compressBeforeUpload(file: File): Promise<File> {
  if (file.size < 500_000) return file; // Skip small files
  const buffer = await file.arrayBuffer();
  const compressed = await compress(new Uint8Array(buffer), { level: 6 });
  return new File([compressed], file.name + '.gz', { type: 'application/gzip' });
}
```

### 🟡 Medium: No file deduplication

**Finding:** No SHA-256 or content hashing before storage. The same file uploaded twice creates two storage entries.

**Fix:** Hash file content before upload:
```tsx
async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

## Domain 6: Bulk Data Migration & Ingestion

### 🔴 Critical: No checkpoint/resume mechanism

**`convex/imports.ts`** — Bulk imports process rows sequentially but have no checkpoint. If a 5,000-row import fails at row 4,000, the user must re-upload and re-process all 5,000 rows.

**Impact:** Wasted compute, frustrated users, potential duplicate records on retry.

**Fix:** Add checkpoint tracking:
```ts
export const importStudentsBatch = mutation({
  args: {
    runId: v.id("import_runs"),
    startRow: v.number(),
    batchSize: v.number(),
    // ...
  },
  handler: async (ctx, args) => {
    // Process batch, update progress in import_runs table
    await ctx.db.patch(args.runId, {
      lastProcessedRow: args.startRow + args.batchSize,
      status: "in_progress",
    });
  },
});
```

### 🟡 Medium: Large imports hit execution limits

**`convex/imports.ts`** — The `importStudents` mutation processes all rows in a single mutation. For 5,000+ rows, this will hit Convex's 16MB execution limit.

**Fix:** Process in chunks using `ctx.scheduler.runAfter`:
```ts
export const importStudentsChunked = action({
  args: { runId: v.id("import_runs"), rows: v.array(v.any()) },
  handler: async (ctx, args) => {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < args.rows.length; i += CHUNK_SIZE) {
      const chunk = args.rows.slice(i, i + CHUNK_SIZE);
      await ctx.runMutation(internal.imports.importStudentsBatch, {
        runId: args.runId,
        startRow: i,
        batchSize: chunk.length,
        rows: chunk,
      });
    }
  },
});
```

---

## Top 10 Cost & Performance Bottlenecks (Ranked)

| # | Issue | Impact | Category |
|---|-------|--------|----------|
| 1 | Zero `usePaginatedQuery` — all lists load fully | 🔴 High DB reads + egress | Pagination |
| 2 | Dashboard fires 5 full-list queries on mount | 🔴 High concurrent reads | Subscriptions |
| 3 | 43 unbounded `.collect()` calls | 🔴 High DB reads | Indexing |
| 4 | No visibility-based subscription cleanup | 🟡 Wasted bandwidth | Subscriptions |
| 5 | `take(50000)` in analytics without school scoping | 🔴 High DB reads | Indexing |
| 6 | No client-side file compression | 🟡 Storage costs | File Storage |
| 7 | No file deduplication (hashing) | 🟡 Storage costs | File Storage |
| 8 | No import checkpoint/resume | 🟡 Wasted compute | Migration |
| 9 | `comprehensiveReports` reads 30+ tables | 🔴 Execution time limits | Actions |
| 10 | Admin pages fetch unbounded school lists | 🟡 Scaling concern | Subscriptions |

---

## Architectural Guardrails

### 1. `useScopedQuery` — Enforce school scoping
```tsx
function useScopedQuery(fn: any, schoolId: string | undefined) {
  return useQuery(fn, schoolId ? { schoolId } : "skip");
}
```

### 2. `useLazyQuery` — Visibility-aware subscriptions
```tsx
function useLazyQuery(fn: any, args: any) {
  const [visible, setVisible] = useState(document.visibilityState === "visible");
  useEffect(() => {
    const h = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  return useQuery(fn, visible ? args : "skip");
}
```

### 3. Query budget rule
```ts
// NEVER exceed these limits without explicit approval:
const QUERY_LIMITS = {
  dashboard: 500,      // Per-table on dashboard
  listPage: 1000,      // Per-table on list pages
  analytics: 10000,    // Analytics queries
  export: 50000,       // Data exports (one-time)
};
```

---

## Validation Summary

| Check | Status | Notes |
|-------|--------|-------|
| Can safely ingest large legacy files? | ⚠️ Partial | Chunked processing needed for >1000 rows |
| Storage costs bounded? | ⚠️ Partial | No compression, no dedup |
| User experience degraded by bulk ops? | 🔴 Yes | No progress tracking, no resume |
| WebSocket costs controlled? | 🔴 No | No visibility management, no pagination |

---

*Report generated by Buffy — SchoolMNG Convex Infrastructure Audit*
