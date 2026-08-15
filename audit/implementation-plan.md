# Implementation Plan: School Management System Hardening

**Date:** August 10, 2026  
**Author:** Principal Systems Architect  
**Based on:** Architecture Review + Claim-by-Claim Verdict  
**Target:** Production readiness for 100+ concurrent schools

---

## Executive Summary

The system has a solid architectural foundation (tenant isolation, webhook verification, idempotency) but lacks the engineering rigor required for safe scaling. **Critical gaps** include:  
- **Zero test coverage** (unit, integration, E2E)  
- **Broken linting** (Next 16 removed `next lint`, ESLint absent)  
- **26 transitive vulnerabilities** (15 high, 11 moderate) in auth/asset pipeline  
- **Unbounded `.take(50000)` queries** in analytics dashboard  
- **Hand-rolled Sentry client** that can silently fail  
- **No client-side cache** (React Query absent)  
- **Synchronous long-running operations** (bulk imports, OCR, emails)

This plan prioritises **security** (vulns), **reliability** (tests), and **maintainability** (linting, docs) in Phase 0–1, then addresses performance and scalability in Phases 2–4.

---

## Phase 0: Emergency Fixes (Week 1 – Immediate)

| Task | Owner | Effort | Dependencies | Success Criteria |
|------|-------|--------|--------------|------------------|
| **0.1 Resolve transitive vulnerabilities** | Lead Backend | 4h | None | `npm audit` reports 0 critical/high vulnerabilities after targeted upgrades |
| **0.2 Replace hand-rolled `sentry.ts`** | Lead Backend | 2h | None | Convex errors use official `@convex-dev/sentry` or `@sentry/node` |
| **0.3 Fix analytics `.take(50000)`** | Backend | 3h | None | Query limited to last 90 days + pagination; dashboard loads in <2s |
| **0.4 Restore linting (ESLint)** | Frontend Lead | 2h | None | `npm run lint` passes; CI fails on warnings |
| **0.5 Add `npm ci` to CI** | DevOps | 1h | None | CI uses lockfile integrity |
| **0.6 Remove postinstall hack** | Frontend Lead | 1h | Task 0.1 | Clerk imports work without internal patch |

---

### Details for Phase 0

#### 0.1 Transitive Vulnerabilities
- **Current state**: `npm audit` reports 26 vulns, most stemming from `tauri-plugin-clerk` → `@clerk/clerk-js` → `react-native` → `metro` → `image-size` (DoS), and `sharp`/`libvips` (CVE-2026-33327/28, 35590/91).
- **Action**:
  - Upgrade `tauri-plugin-clerk` to latest (check if 0.1.2 or higher resolves).
  - If not, override vulnerable transitive dependencies using `overrides` in `package.json` to pin safe versions (e.g., `"image-size": "1.2.0"`).
  - Run `npm audit fix --dry-run` first; avoid `--force` unless necessary.
  - Document overrides in `README.md`.
- **Verification**: `npm audit` reports `found 0 vulnerabilities`.

#### 0.2 Replace Hand-Rolled Sentry
- **Current**: `convex/sentry.ts` re-implements HTTP envelope sending (~100 lines) – can break on Sentry API changes.
- **Action**:
  - Install `@convex-dev/sentry` (or `@sentry/node` if more appropriate).
  - Use official `sentry.convex` wrapper; minimal config.
  - Remove `convex/sentry.ts` and update error handlers to use the official client.
- **Verification**: Errors appear in Sentry with correct context (user, school, function).

#### 0.3 Fix Unbounded Analytics Queries
- **Current**: `convex/analytics.ts` uses `.take(50000)` on multiple queries (lines 16–21, 166–207). A principal viewing dashboard can scan huge collections.
- **Action**:
  - Limit queries to last 90 days (add `gt` filter on `_creationTime`).
  - Implement pagination with cursor for large exports; for dashboard summary, use aggregation (Convex `aggregate`).
  - Add indexes on `schoolId` + `timestamp`.
- **Verification**: Dashboard loads under 2s for schools with 50k records.

#### 0.4 Restore Linting
- **Current**: `npm run lint` calls `next lint` (removed in Next 16). ESLint not installed.
- **Action**:
  - Install `eslint` v9, `eslint-config-next`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-import`.
  - Create `eslint.config.js` (flat config) with Next.js recommended + TypeScript rules.
  - Update `package.json` scripts: `"lint": "eslint . --ext .ts,.tsx"`.
  - Add to CI: `npm run lint` (fail on warnings for now, later only errors).
- **Verification**: `npm run lint` produces no errors (warnings allowed temporarily).

#### 0.5 CI Lockfile Integrity
- **Current**: CI uses `npm install` – can introduce drift.
- **Action**: Change to `npm ci --ignore-scripts`; run postinstall hack manually only if necessary (but we aim to remove hack).
- **Verification**: Builds are reproducible.

#### 0.6 Remove Clerk Postinstall Hack
- **Current**: `fix-clerk-shared.mjs` patches Clerk internals – break on version updates.
- **Action**: Work with Clerk/Tauri plugin to resolve issue upstream; if impossible, use official Clerk Tauri plugin from `@clerk/tauri` (if available) or move to alternative auth flow.
- **Verification**: Login works without patch.

---

## Phase 1: Testing & Quality (Week 2)

| Task | Owner | Effort | Dependencies | Success Criteria |
|------|-------|--------|--------------|------------------|
| **1.1 Setup Vitest + @convex-dev/test** | Backend | 3h | Phase 0.4 (lint) | `npm test` runs unit tests with coverage |
| **1.2 Write authz negative tests** | Backend | 4h | 1.1 | All `requireSchoolMembership` variants tested (cross-tenant access denied) |
| **1.3 Write billing idempotency tests** | Backend | 3h | 1.1 | Paystack webhook idempotence verified with duplicate events |
| **1.4 Setup Playwright E2E** | Frontend Lead | 3h | 1.1 | Critical user flows (sign-in, borrow/return, invite) automated |
| **1.5 Install Prettier + pre-commit hooks** | All devs | 2h | None | Code formatting enforced; no style debates in PRs |
| **1.6 Fix README/doc drift** | Tech Writer | 1h | None | README matches actual tech (Chart.js, correct webhook path) |

---

### Details for Phase 1

- **1.1**: Use `vitest` with `@convex-dev/test` to run Convex functions in isolation. Mock `ctx.db` for authz tests.
- **1.2**: Write tests: school A user tries to access school B student list – expect `throw new Error('Unauthorized')`.
- **1.3**: Simulate duplicate Paystack webhook with same `eventId`; ensure only one invoice is created.
- **1.4**: Playwright tests for: login, create school, invite member, borrow/return. Use Clerk test environment (or stubs).
- **1.5**: Add `.prettierrc`, `husky` + `lint-staged`. Run `prettier --write` on commit.
- **1.6**: Correct webhook paths in README to `/api/webhooks/clerk` (not `/api/clerk/webhook`). Update Recharts reference to Chart.js.

---

## Phase 2: Caching & Performance (Week 3)

| Task | Owner | Effort | Dependencies | Success Criteria |
|------|-------|--------|--------------|------------------|
| **2.1 Install @tanstack/react-query** | Frontend Lead | 2h | None | Dashboard queries cached with stale-while-revalidate |
| **2.2 Implement cache for common queries** | Frontend | 3h | 2.1 | Student lists, school settings use React Query |
| **2.3 Add pagination to large lists** | Frontend + Backend | 4h | Phase 0.3 | Student list uses cursor-based pagination |
| **2.4 Optimise Convex indexes** | Backend | 2h | None | All `where` queries have appropriate indexes; use `explain` |
| **2.5 Add Redis (optional?)** | Backend | 4h | None | If Convex caching insufficient, add external Redis for high-read data |

---

### Details for Phase 2

- **2.1**: Install `@tanstack/react-query` and set up `QueryClientProvider` wrapping the app.
- **2.2**: For every `useQuery` hook, add `staleTime: 5min`, `gcTime: 10min`. Implement optimistic updates on mutations.
- **2.3**: Change Convex queries to accept `cursor` and `limit`; frontend uses `useInfiniteQuery` for infinite scroll.
- **2.4**: Review all `db.query().withIndex(...)` usage; add missing indexes in Convex dashboard.
- **2.5**: Evaluate if Convex's built-in caching (via `cached` helper) is sufficient; if not, use a Redis-backed cache for school settings and configs.

---

## Phase 3: Asynchronous Processing (Week 4)

| Task | Owner | Effort | Dependencies | Success Criteria |
|------|-------|--------|--------------|------------------|
| **3.1 Migrate bulk CSV import to background job** | Backend | 4h | None | Import runs via scheduled function; user notified on completion |
| **3.2 Migrate OCR processing to background job** | Backend | 4h | None | OCR runs async; results stored via webhook |
| **3.3 Migrate email notifications to background** | Backend | 2h | None | Emails sent via scheduled function, not blocking request |
| **3.4 Add retry logic for failed jobs** | Backend | 2h | 3.1-3.3 | Jobs retry up to 3 times with exponential backoff |
| **3.5 Set up Convex cron for maintenance** | Backend | 1h | None | Rate-limit cleanup, audit log rotation scheduled |

---

### Details for Phase 3

- Use Convex `ctx.scheduler.runAfter` or `runAt` to defer work. For long-running tasks, use `schedule` with idempotency keys.
- For each background job:
  - Store job status in a `jobs` table.
  - Provide a UI progress indicator (via subscription).
  - On completion, send a notification (in-app or email).
- For emails, use a dedicated email service (e.g., Resend) and call it from the job.

---

## Phase 4: Observability & Documentation (Week 5)

| Task | Owner | Effort | Dependencies | Success Criteria |
|------|-------|--------|--------------|------------------|
| **4.1 Add Sentry performance monitoring spans** | Backend | 2h | None | Slow Convex functions appear in Sentry Performance |
| **4.2 Add custom metrics to Convex** | Backend | 2h | None | Key business metrics (schools, students, transactions) are exported |
| **4.3 Write backup/restore runbook** | DevOps | 3h | None | Documented steps for Convex restore + data export |
| **4.4 Set up Dependabot + weekly audit** | DevOps | 1h | None | Automated PRs for dependency updates |
| **4.5 Update `SECURITY-AUDIT.md`** | Security Lead | 2h | All | Reflect current state and mitigations |
| **4.6 Multi-platform CI (macOS, Linux)** | DevOps | 2h | None | Tauri builds for all platforms |

---

### Details for Phase 4

- **4.1**: Use `@sentry/convex` (if available) or manually add spans in Convex functions using `Sentry.startSpan`.
- **4.2**: Use Convex's `convex.metrics` to track counts per school.
- **4.3**: Include steps to export data from Convex dashboard, and restore from a snapshot.
- **4.4**: Add `.github/dependabot.yml` with weekly schedule; merge patch versions automatically after CI passes.
- **4.5**: Update with current findings and mitigations.
- **4.6**: Expand `release.yml` to include `macos-latest` and `ubuntu-latest` matrices.

---

## Appendix: Full Action Item Table

| ID | Task | Priority | Phase | Est. Hours | Critical for Launch? |
|----|------|----------|-------|------------|----------------------|
| 0.1 | Resolve transitive vulns | P0 | 0 | 4 | ✅ |
| 0.2 | Replace hand-rolled Sentry | P0 | 0 | 2 | ✅ |
| 0.3 | Fix analytics `.take(50000)` | P0 | 0 | 3 | ✅ |
| 0.4 | Restore linting | P0 | 0 | 2 | ✅ |
| 0.5 | `npm ci` in CI | P0 | 0 | 1 | ✅ |
| 0.6 | Remove Clerk postinstall hack | P0 | 0 | 1 | ✅ |
| 1.1 | Setup testing framework | P1 | 1 | 3 | ✅ |
| 1.2 | Authz negative tests | P1 | 1 | 4 | ✅ |
| 1.3 | Billing idempotency tests | P1 | 1 | 3 | ✅ |
| 1.4 | E2E tests | P1 | 1 | 3 | ✅ |
| 1.5 | Prettier + pre-commit | P1 | 1 | 2 | ❌ |
| 1.6 | Fix doc drift | P1 | 1 | 1 | ❌ |
| 2.1 | Install React Query | P2 | 2 | 2 | ❌ |
| 2.2 | Implement cache | P2 | 2 | 3 | ❌ |
| 2.3 | Pagination | P2 | 2 | 4 | ❌ |
| 2.4 | Optimise indexes | P2 | 2 | 2 | ❌ |
| 2.5 | Redis (optional) | P2 | 2 | 4 | ❌ |
| 3.1 | Background: CSV import | P2 | 3 | 4 | ❌ |
| 3.2 | Background: OCR | P2 | 3 | 4 | ❌ |
| 3.3 | Background: Emails | P2 | 3 | 2 | ❌ |
| 3.4 | Retry logic | P2 | 3 | 2 | ❌ |
| 3.5 | Convex crons | P2 | 3 | 1 | ❌ |
| 4.1 | Sentry performance spans | P3 | 4 | 2 | ❌ |
| 4.2 | Custom metrics | P3 | 4 | 2 | ❌ |
| 4.3 | Backup/restore runbook | P3 | 4 | 3 | ❌ |
| 4.4 | Dependabot | P3 | 4 | 1 | ❌ |
| 4.5 | Update SECURITY-AUDIT.md | P3 | 4 | 2 | ❌ |
| 4.6 | Multi-platform CI | P3 | 4 | 2 | ❌ |

**Total estimated hours**: ~60 (spread over 5 weeks with 2–3 developers).

---

## Success Metrics

After Phase 0:
- No high-severity vulnerabilities.
- Linting passes CI.
- Analytics queries <2s.

After Phase 1:
- Test coverage >70% for critical business logic.
- E2E tests run in CI.

After Phase 2:
- Dashboard load time <1s for 95th percentile.
- Pagination implemented for all long lists.

After Phase 3:
- No blocking operations on main request path.
- Job failure rate <1%.

After Phase 4:
- Full observability (performance, errors, business metrics).
- All platforms built and tested automatically.

---

## Notes for the Team

- **Ownership**: Assign each phase to a single lead to avoid fragmentation.
- **Dependencies**: Some tasks can run in parallel (e.g., linting and testing setup).
- **Testing**: Prioritise authz and billing; these are the highest-risk areas.
- **Documentation**: Update the `SECURITY-AUDIT.md` and `CACHING-STRATEGY.md` to reflect actual implemented solutions.

---

This plan is aggressive but necessary. The system is not far from being enterprise-ready; these improvements will de-risk scaling and make future development significantly faster and safer.