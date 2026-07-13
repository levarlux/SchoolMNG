# SchoolMNG — Comprehensive Security, Maintainability, Scalability & Code Quality Analysis

**Date:** 2026-07-13  
**Reviewed by:** Automated static + dynamic analysis  
**Scope:** All Convex backend functions (`convex/`) and client library files (`src/lib/`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Analysis](#2-security-analysis)
3. [Maintainability](#3-maintainability)
4. [Scalability](#4-scalability)
5. [Code Quality](#5-code-quality)
6. [Error Logging & Observability](#6-error-logging--observability)
7. [Recommendations (Prioritised)](#7-recommendations-prioritised)

---

## 1. Executive Summary

| Area | Rating | Key Issues |
|------|--------|------------|
| **Security** | **B+** | Strong tenant isolation via JWT-derived org_id. No client-supplied user IDs for auth. Webhook uses shared-secret pattern. |
| **Maintainability** | **B** | Clean module separation. Good use of shared helpers. Some duplication in filter/patch patterns. |
| **Scalability** | **C+** | Fixed `.take(N)` limits are good, but several queries pull full tables in analytics. No paginated exports. No cron-driven snapshot scheduler. |
| **Code Quality** | **B+** | Consistent patterns. Proper async/await. Strong arg validation. Some `any` casts. |
| **Error Logging** | **C** | Only `console.error`/`console.warn` with static strings. No structured logging, no correlation IDs, no log levels. Sentry is installed but appears unused in backend. |
| **Overall** | **B** | Solid foundation with clear auth architecture. Main gaps are in observability, analytics scalability, and some hardening. |

---

## 2. Security Analysis

### 2.1 Authentication ✅ **Good**

- **Server-side auth enforcement**: Every endpoint calls `requireAuth`, `requireSuperadmin`, or `requireSchoolMembership` before touching data.
- **JWT-derived identity**: `ctx.auth.getUserIdentity()` is used for all auth decisions — no user ID is ever accepted as a client argument for authorization. **This is the correct pattern.**
- **Superadmin role**: Read from `publicMetadata` in the JWT — cannot be spoofed by clients.

### 2.2 Tenant Isolation ✅ **Very Good**

- **`requireSchoolMembership`**: Looks up the school by ID, then compares `school.clerkOrgId` against the JWT's `org_id` claim. This is **the canonical cross-tenant guard**.
- **`requireSchoolFromJwt`**: Derives the school entirely from the JWT org — no client-supplied school ID at all. Used by `getMySchool`, `updateMySchool`, `setMyLogo`, `featureFlags`.
- **`requireStudentMembership` / `requireClassMembership` / `requireBorrowingMembership` / `requireBookMembership`**: Each verifies that the referenced document belongs to the caller's school. No possibility of ORM-level cross-tenant leaks.

### 2.3 Webhook Security ✅ **Adequate**

- `handleOrganizationEvent` checks a shared secret (`CLERK_WEBHOOK_SECRET`) against `process.env`. This is the standard pattern for webhooks.
- ⚠️ **Minor risk**: The secret is passed as a plain argument from the client side. If a client-side error leaks the function reference, an attacker who learns the secret could replay events. This is inherent to the Convex model where even "public" mutations are callable. Mitigation: keep the secret rotated and ensure HTTPS-only transport.

### 2.4 Input Validation ✅ **Good**

- All Convex functions use `v.*` validators — **every single one checked** ✅.
- Custom hex colour validation: `assertValidHexColor` ✅.
- Positive amount checks on fines and payments ✅.
- Due date must be in the future ✅.
- Borrow limit enforcement (max 5 active) ✅.

### 2.5 Output (Response) Security ✅ **Good**

- `getBySlug` explicitly strips internal fields before returning to unauthenticated callers ✅.
- No raw error details leaked — errors are generic strings like "Not authorised", "Not found".

### 2.6 Security Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| S1 | **Medium** | `admin.ts` | `assertSuperadmin` duplicates logic from `helpers.ts`. If one is updated but not the other, superadmin enforcement could diverge. Always use the canonical `requireSuperadmin` from helpers. |
| S2 | **Low** | `reports.ts:95-96` | Date filtering is done in-memory after fetching all borrowings. A crafted request with no date filter returns all records. Mitigated by `.take(5000)` but still a data exposure surface. |
| S3 | **Low** | `students.ts:58` | Search index uses `.filter()` on schoolId instead of including it in the search index. The `withSearchIndex` + `filter` combo means Convex fetches all matching firstName results first, then filters by schoolId client-side — potential cross-tenant result leakage in extreme edge cases. |
| S4 | **Low** | `streams.ts:45` | `requireClassMembership(ctx, stream.classId)` verifies the class, but the stream's `schoolId` is **not independently verified** against the JWT. The class check is transitive, so isolation holds, but it's an indirect verification that should be documented. |

---

## 3. Maintainability

### 3.1 Code Organisation ✅ **Good**

- One file per domain entity (`schools.ts`, `students.ts`, `books.ts`, etc.) ✅
- Shared auth helpers in `helpers.ts` ✅
- Clerk API wrapper in dedicated `clerk.ts` ✅
- Migration helpers isolated in `backfill_streams_helpers.ts` ✅

### 3.2 DRY (Don't Repeat Yourself) ⚠️ **Some Duplication**

| # | File(s) | Issue |
|---|---------|-------|
| M1 | `admin.ts:6-13` vs `helpers.ts:35-39` | `assertSuperadmin` duplicates `requireSuperadmin`. Should import instead. |
| M2 | `schools.ts:116-118`, `classes.ts:47-49`, `books.ts:77-79`, `subscriptions.ts:44-46`, `feature_configurations.ts:52-54` | The `filter undefined` + `patch` pattern is repeated 5+ times. Extract to a helper: `async function patchFields(ctx, table, id, updates)` |
| M3 | `reports.ts:85-96`, `reports.ts:157-159` | In-memory date filtering repeated across reports. Extract to shared utility. |

### 3.3 Naming Conventions ✅ **Good**

- Consistent verb prefixes: `listByX`, `getByX`, `create`, `update`, `remove`, `markX`
- Clear JSDoc comments on complex functions (`helpers.ts`, `webhooks.ts`)
- Descriptive variable names throughout

### 3.4 Comments & Documentation ⚠️ **Adequate**

- Gaps: No module-level docstring explaining the multi-tenant architecture.
- No inline comments on why `.take(N)` limits are chosen (what happens at scale).
- No README or architecture doc for new developers.

---

## 4. Scalability

### 4.1 Query Patterns ✅ **Good Practices**

- All listing queries use `.withIndex()` — no table scans ✅
- All listing queries use `.take(N)` with explicit limits ✅
- No `.collect()` in production query paths (except analytics — see below) ✅

### 4.2 Scalability Issues Found

| # | Severity | File | Issue |
|---|----------|------|-------|
| SC1 | **High** | `analytics.ts` | `systemOverview` and `schoolComparison` call `.take(50000)` on multiple tables. As any school grows beyond 50k students/books, these **will silently truncate data and return incorrect analytics**. Convex queries also count toward transaction read limits — 50k * 6 tables could hit the 256KB response limit. |
| SC2 | **High** | `analytics.ts:58-62` | `.collect()` on 4 tables simultaneously loads every document into memory. At 10k+ schools this will OOM or timeout. |
| SC3 | **Medium** | `reports.ts` | All report queries use `.take(5000)`. In large schools (5000+ students, 5000+ borrowings) reports will be **incomplete without warning**. Reports should use pagination or chunked streaming. |
| SC4 | **Medium** | `classes.ts:72` | `.collect()` on streams when deleting a class. With 1000+ streams this could hit Convex's 8KB mutation limit. Use batched deletes via scheduler. |
| SC5 | **Low** | `fines.ts:211-214` | `.collect()` on fine_payments when deleting a fine. Similar batch risk. |
| SC6 | **Low** | `borrowings.ts:63-66` | `.take(100)` for active borrowings check is safe now, but document as a scaling boundary. The borrow limit is 5, so 100 is generous. |
| SC7 | **Info** | Schema | No `by_schoolId_and_createdAt` index exists for time-ordered queries. Reports and dashboards sort by `_creationTime` implicitly via `.order("desc")`, but without a composite index this falls back to a table scan in some edge query paths. |

### 4.3 Recommended Index Additions

```typescript
// For time-ordered per-school queries (reports, dashboards)
books: defineTable({...}).index("by_schoolId_creationTime", ["schoolId", "_creationTime"])
students: defineTable({...}).index("by_schoolId_creationTime", ["schoolId", "_creationTime"])
borrowings: defineTable({...}).index("by_schoolId_creationTime", ["schoolId", "_creationTime"])
fines: defineTable({...}).index("by_schoolId_creationTime", ["schoolId", "_creationTime"])
```

---

## 5. Code Quality

### 5.1 TypeScript Strictness ✅ **Good**

- Proper `Id<"tablename">` generics used throughout ✅
- Function args validated with `v.*` on every exported function ✅
- `Doc<"tablename">` used for return types where appropriate ✅
- No `any` on function signatures (except `feature_configurations.ts:config: v.any()` which is legitimate for dynamic config) ✅

### 5.2 TypeScript Issues

| # | File | Issue |
|---|------|-------|
| Q1 | `helpers.ts:24` | `Record<string, unknown>` cast for JWT metadata is necessary but fragile — if Clerk changes the metadata shape, no type errors will fire. Consider defining a `JwtIdentity` interface. |
| Q2 | `admin.ts:11` | Same `Record<string, unknown>` cast duplicated. |
| Q3 | `backfill_streams.ts:11-15` | Heavy use of `(ctx as any)`. Migration scripts are one-off so acceptable, but should use typed `ctx.runQuery`/`ctx.runMutation` with proper return annotations. |
| Q4 | `helpers.ts:4` | `type Ctx = QueryCtx \| MutationCtx` is good, but action contexts are not included. If an action ever needs these helpers, it would fail silently. |

### 5.3 Error Handling ✅ **Good Patterns**

- All mutations check existence before operating ✅
- Business rule validation (e.g., "cannot delete class with students") ✅
- Errors thrown with descriptive messages ✅

### 5.4 Error Handling Issues

| # | Issue |
|---|-------|
| Q5 | No structured error types. All errors are `new Error("string")`. Makes programmatic error handling on the client fragile — clients must parse string messages. |
| Q6 | `requireSchoolMembership` throws `"School not found"` regardless of whether the ID is invalid or the org doesn't match. This leaks information (attacker can probe valid school IDs by checking error message vs "Not authorised"). |
| Q7 | Several `catch` blocks (e.g., `schools.ts:98`) silently swallow errors with `return null`. This hides transient failures from operators. |

---

## 6. Error Logging & Observability

### 6.1 Current State

| Aspect | Status | Detail |
|--------|--------|--------|
| Backend logging | ❌ **Inadequate** | Only 4 `console.error`/`console.warn` call sites in the entire Convex backend |
| Structured logging | ❌ **Missing** | No JSON, no correlation IDs, no log levels |
| Error aggregation | ⚠️ **Partial** | `@sentry/nextjs` is in `package.json` but there is **no Sentry.init() or Sentry integration** visible in the Convex backend |
| Client logging | ❌ **Missing** | `sonner` is installed (toast library) but no server-error reporting pipeline |
| Audit trail | ⚠️ **Partial** | `report_logs` table exists but is **never written to** — the schema is defined but no mutation inserts logs |

### 6.2 All Logging Calls

| File | Line | Call Type | What it logs |
|------|------|-----------|-------------|
| `borrowings.ts` | 78 | `console.error` | "Book not found" |
| `borrowings.ts` | 82 | `console.error` | "Book does not belong to school" |
| `borrowings.ts` | 86 | `console.error` | "No copies available" |
| `borrowings.ts` | 114 | `console.error` | "Borrowing not found" |
| `webhooks.ts` | 21 | `console.warn` | "Invalid webhook secret received" |
| `webhooks.ts` | 67 | `console.warn` | "School deletion blocked: classes still exist" |
| `webhooks.ts` | 76 | `console.warn` | "School deletion blocked: students still exist" |

**No logging exists for:**
- Successful operations (creates, updates, deletes)
- Auth failures (who tried to access what)
- Rate limiting triggers
- Query performance metrics
- Any analytics/snapshot operations

### 6.3 Recommendations for Observability

#### 6.3.1 Structured Logging Middleware

```typescript
// convex/lib/logger.ts
export function log(level: "info" | "warn" | "error", module: string, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...meta,
  };
  console[level](JSON.stringify(entry));
}
```

Replace all bare `console.error` calls with:

```typescript
log("error", "borrowings", "Book not found", { bookId: args.bookId, schoolId: args.schoolId });
```

#### 6.3.2 Audit Log Mutations

Wire the existing `report_logs` table (create a mutation) and call it on any write operation:

```typescript
// In helpers.ts or a dedicated audit module
export async function logAuditEntry(ctx: MutationCtx, schoolId: Id<"schools">, action: string, details?: Record<string, unknown>) {
  await ctx.db.insert("report_logs", {
    schoolId,
    generatedBy: (await ctx.auth.getUserIdentity())?.subject ?? "system",
    reportType: action,
    generatedAt: Date.now(),
    params: details,
  });
}
```

#### 6.3.3 Convex Logging Stream

Convex surfaces logs in the dashboard. Consider adding `convex.json` or `convex.config.ts` to route logs to a log drain (e.g., Axiom, Datadog, or Logtail) for production.

#### 6.3.4 Sentry Integration

`@sentry/nextjs` is installed but likely only for the frontend. To capture Convex backend errors:

```typescript
// convex/sentry.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.CONVEX_CLOUD_URL?.includes("preview") ? "preview" : "production",
});
```

Then wrap any top-level actions with Sentry error capture.

---

## 7. Recommendations (Prioritised)

### 🔴 Critical (must fix)

| # | Area | Action | Effort |
|---|------|--------|--------|
| R1 | Scalability | Rewrite `systemOverview` and `schoolComparison` to use indexed paginated queries + aggregation snapshots instead of full-table pulls. Or add a cap and document max scale. | 2 days |
| R2 | Observability | Wire Sentry into Convex backend. Add `Sentry.withScope` / `Sentry.captureException` to all action error paths. | 4 hours |

### 🟠 High (should fix)

| # | Area | Action | Effort |
|---|------|--------|--------|
| R3 | Security | Refactor `admin.ts` to import `requireSuperadmin` from helpers instead of duplicating. | 15 min |
| R4 | Scalability | Add composite `by_schoolId_and_creationTime` indexes to books, students, borrowings, fines tables. | 30 min |
| R5 | Observability | Replace all `console.error`/`console.warn` with structured logging helper. | 1 hour |
| R6 | Maintainability | Extract the common "filter undefined fields then patch" pattern into a reusable `patchDefinedFields(ctx, table, id, fields)` helper. | 1 hour |
| R7 | Logging | Wire the `report_logs` table — insert an audit entry on every create/update/delete mutation. | 2 hours |

### 🟡 Medium (should consider)

| # | Area | Action | Effort |
|---|------|--------|--------|
| R8 | Scalability | Add automatic analytics snapshot via Convex cron job (e.g., daily at midnight). Currently must be triggered manually. | 1 hour |
| R9 | Quality | Define a `JwtIdentity` TypeScript interface to replace `Record<string, unknown>` casts. | 30 min |
| R10 | Maintainability | Add module-level JSDoc to each file explaining the domain and tenant isolation pattern. | 1 hour |
| R11 | Security | Add rate limiting on the server side for mutations (e.g., max 5 creates per minute per user). Client-side rate limit (`rate-limit.ts`) is bypassable. | 2 hours |
| R12 | Scalability | Make `classes.ts:remove` and `fines.ts:remove` use batched deletes via `ctx.scheduler.runAfter(0, ...)` for safety at scale. | 1 hour |

### 🟢 Low (nice to have)

| # | Area | Action | Effort |
|---|------|--------|--------|
| R13 | Quality | Add `type ActionCtx` to the `Ctx` union in helpers, or at minimum document that helpers don't support action contexts. | 15 min |
| R14 | Scalability | Convert report queries to use Convex-native pagination (`paginate()` + `paginationOptsValidator`) instead of large `.take()` calls. | 3 hours |
| R15 | Security | Differentiate "school not found" from "not authorised" error messages to avoid information leakage, or always return a generic "not found" message. | 15 min |
| R16 | Observability | Create a Convex health-check query (`/api/health`) that verifies DB connectivity and returns uptime metadata. | 30 min |

### Files Requiring Changes

Based on the analysis above, here is the complete list of files that would need modification:

| File | Changes |
|------|---------|
| `convex/admin.ts` | Remove duplicate `assertSuperadmin`, import from helpers |
| `convex/schema.ts` | Add composite indexes for time-ordered queries |
| `convex/analytics.ts` | Rewrite systemOverview & schoolComparison for paginated/aggregated reads |
| `convex/borrowings.ts` | Replace console.error with structured logging |
| `convex/webhooks.ts` | Replace console.warn with structured logging |
| `convex/helpers.ts` | Add `patchDefinedFields` helper; add structured `log` function; add `logAuditEntry` mutation |
| `convex/classes.ts` | Use batched delete for streams |
| `convex/fines.ts` | Use batched delete for fine_payments |
| `convex/*.ts` (all modules) | Wire audit log calls on write operations |
| New file: `convex/crons.ts` | Daily analytics snapshot cron |
| New file: `convex/lib/logger.ts` | Structured logging utility |
| `convex/sentry.ts` | Sentry init for Convex backend |
| `src/lib/rate-limit.ts` | Document as client-side only; move critical rate limiting to server |
| All report queries | (Future) Convert to paginated responses |

---

## Appendix: Files Examined (23 files)

- `convex/schema.ts` — Schema definition
- `convex/auth.config.ts` — Auth provider config
- `convex/helpers.ts` — Auth & validation helpers
- `convex/schools.ts` — School CRUD
- `convex/students.ts` — Student CRUD + search
- `convex/classes.ts` — Class CRUD
- `convex/streams.ts` — Stream CRUD
- `convex/books.ts` — Book CRUD + bulk create
- `convex/borrowings.ts` — Borrowing lifecycle
- `convex/fines.ts` — Fine lifecycle + payments
- `convex/admins.ts` — Admin user management
- `convex/subscriptions.ts` — Subscription management
- `convex/feature_configurations.ts` — Feature flags
- `convex/files.ts` — File uploads
- `convex/analytics.ts` — System analytics
- `convex/reports.ts` — Exportable reports
- `convex/webhooks.ts` — Clerk webhook handler
- `convex/clerk.ts` — Clerk API wrapper
- `convex/admin.ts` — Superadmin actions (create/update/delete school)
- `convex/backfill_streams.ts` — Migration action
- `convex/backfill_streams_helpers.ts` — Migration queries
- `src/lib/rate-limit.ts` — Client-side rate limiter
- `src/proxy.ts` — Clerk middleware + subdomain routing
- `package.json` — Dependencies