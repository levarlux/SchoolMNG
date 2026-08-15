```markdown
# System Architecture Review: School Management System

**Date:** August 10, 2026
**Reviewer:** Principal Systems Architect
**Status:** Critical Findings Identified

---

## Executive Summary Card

| Pillar | Grade | Confidence |
|--------|-------|------------|
| **Maintainability** | **5.5/10** | High |
| **Scalability** | **5.0/10** | Medium |
| **Code Quality** | **4.0/10** | High |
| **Security** | **6.5/10** | High |

> **Verdict:** Production-capable core with enterprise-grade auth/tenant isolation, but **zero test coverage**, **non-existent linting**, and **no caching layer** will cause issues at scale. The team has good architectural instincts (idempotency, audit logs, signature verification) but lacks the engineering rigor to ship with confidence.

---

## Critical Gaps (Must Fix Before Scaling)

### 1. 🔴 Non-Functional Quality Pipeline
- **npm run lint** is broken: `next lint` removed in Next.js 16, ESLint not installed
- CI only runs `tsc --noEmit` — misses runtime bugs, style violations, security anti-patterns
- **No formatting** (Prettier/Biome), making code reviews noisy and diffs harder to interpret
- `package.json` has `eslint` in `devDependencies`? Actually, it doesn't — check your locks.

**Impact:** Junior devs can introduce bugs without guardrails. Technical debt will accelerate.

### 2. 🔴 Zero Test Coverage
- `npm test` is `echo "No tests specified"`
- No unit tests for Convex mutations/queries (authz, billing logic, bulk operations)
- No E2E tests (critical flows: sign-in, borrow/return, invite member, payment webhooks)
- Billing idempotency cannot be regression-tested

**Impact:** One bad deploy could double-charge schools or drop tenant isolation — **business-ending risk**.

### 3. 🟡 Hand-Rolled Rate Limiter
- `convex/rateLimit.ts` duplicates functionality of `@convex-dev/rate-limiter`
- Custom token bucket implementation means more code to audit, more surface for bugs
- Official package is maintained by Convex team and battle-tested

**Impact:** Potential off-by-one or race conditions in concurrent request handling.

### 4. 🟡 No Client-Side Cache
- `@tanstack/react-query` only present transitively
- Convex subscriptions re-render on every data change (fine for small, death for large tables)
- `CACHING-STRATEGY.md` exists but not implemented

**Impact:** 500+ student lists will cause jank on low-end devices. No offline support.

### 5. 🟡 Supply Chain Risks
- All dependencies use `^` ranges — implicit trust in SemVer
- No Dependabot/Renovate to catch vulnerabilities
- `postinstall` hack (`fix-clerk-shared.mjs`) patches Clerk internals — **breaking on next minor Clerk update**
- No `package-lock.json` integrity checks in CI (`npm ci` not used)

**Impact:** Inconsistent dev/prod deps, and a Clerk patch could silently break auth.

---

## Scalability Risks (When You Hit 100+ Concurrent Users)

### Database & Query Patterns
- **No query indexing documented or enforced** — Convex's built-in indexes help, but no explicit coverage analysis
- **Bulk operations** (e.g., bulk invite, bulk student import) are synchronous — will block other operations
- **No pagination strategy** for large lists — currently using `take(50)` but no cursor-based pagination for sequential loading

### Resource Management
- **Convex functions may hold memory** during long-running operations (OCR, file parsing)
- **No connection pool tuning** — Convex auto-scales, but cold starts on infrequent functions
- **File uploads processed synchronously** — should be background-jobs (Convex scheduled functions)

### Caching Gaps
- No Redis/Memcached for frequently accessed data (school settings, user profiles)
- No stale-while-revalidate strategy for dashboard data
- User sessions not cacheable (Clerk handles, but no local user cache)

### Horizontal Scaling
- ✅ **Stateless**: Convex functions don't keep in-memory state across invocations
- ✅ **Authentication externalized**: Clerk handles session management
- ❌ **No background queue**: Long-running tasks (bulk data processing, email notifications) block the request

---

## Immediate Action Items (Priority-Ordered Checklist)

### 🔴 Week 1 (Critical Path)
- [ ] **Install ESLint 9 + flat config** with `eslint-config-next`, `typescript-eslint`, `eslint-plugin-import`
  - Run `pnpm add -D eslint @eslint/js typescript-eslint eslint-plugin-import eslint-config-next`
  - Create `eslint.config.js`
  - Wire into CI (fail on warnings)
- [ ] **Install Vitest + @convex-dev/test**
  - Write unit tests for all authz functions (`requireSchoolMembership` variants)
  - Test negative cases: user from school A cannot access school B's data
  - Test billing idempotency (Paystack webhook)
- [ ] **Migrate to @convex-dev/rate-limiter**
  - Remove custom `rateLimit.ts`
  - Configure per-endpoint limits with proper token bucket
- [ ] **Add Zod for input validation** at API boundaries (import/studio, OCR, form submissions)
- [ ] **Enable Dependabot** with weekly updates and auto-merge for patch versions

### 🟡 Week 2 (Technical Debt)
- [ ] **Install Prettier** with `lint-staged` + `husky` pre-commit hook
- [ ] **Add Playwright E2E tests** for critical user journeys:
  - `school-admin-invite.spec.ts`
  - `student-borrow-return.spec.ts`
  - `payment-webhook.spec.ts`
- [ ] **Implement React Query cache** for Convex queries (start with dashboard data)
  - Use `staleTime: 5min`, `gcTime: 10min`
  - Add optimistic updates for mutations
- [ ] **Fix `package.json` script inconsistencies**:
  - `npm run lint` → actual ESLint
  - `npm test` → Vitest
  - Add `npm run type-check` → `tsc --noEmit`
- [ ] **Add immutability to CI**: `npm ci --ignore-scripts` (then run postinstall hack manually if needed)

### 🟢 Week 3 (Optimization & Monitoring)
- [ ] **Implement cursor-based pagination** for student lists and transactions
  - Add `lastDocId` / `nextCursor` to queries
  - Convex `paginate` helper or manual implementation
- [ ] **Add Sentry Performance Monitoring** (currently error-only)
  - Track slow Convex function execution (>1s)
  - Add custom spans for OCR, file parsing
- [ ] **Background-ify long-running operations**:
  - Bulk CSV imports → Convex scheduled function
  - Email notifications → Convex cron
  - OCR processing → queue with retry logic
- [ ] **Multi-platform CI**: Add macOS and Linux to Tauri build matrix
- [ ] **Add `cargo-audit`** to CI for Rust dependency scanning

### 🔵 Month 1 (Architecture Evolution)
- [ ] **Consider @convex-dev/cron or workflow system** for complex scheduled tasks
- [ ] **Add @sentry/replay** for user session recording (debugging UX issues)
- [ ] **Evaluate Convex built-in auth + insights** for deployment monitoring
- [ ] **Document all system contracts** in OpenAPI/AsyncAPI format (for team onboarding)

---

## Architecture Diagram (Current State)

```
┌─────────────────────────────────────────────────────────────┐
│                      User Browser                          │
│                  (Next.js + Tauri)                         │
└────────┬──────────────────────────────────────┬────────────┘
         │                                      │
         ▼                                      ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│     Clerk Auth Flow      │     │   Convex Backend         │
│  (SSO, JWT validation)   │     │  - Mutations             │
└──────────────────────────┘     │  - Queries              │
         │                        │  - Subscriptions        │
         ▼                        │  - Scheduler (custom)   │
┌──────────────────────────┐     └──────────────────────────┘
│   Paystack Webhook       │                │
│  (HMAC-SHA512 + idempo)  │                ▼
└──────────────────────────┘     ┌──────────────────────────┐
         │                        │  3rd Party Services      │
         ▼                        │  - Mistral AI            │
┌──────────────────────────┐     │  - Sentry (errors only)  │
│   File Processing         │     │  - Svix (Clerk hooks)   │
│  - CSV, Excel, DOCX       │     └──────────────────────────┘
│  - OCR (Tesseract)        │
└──────────────────────────┘
```

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking change from Clerk patch | High | Critical | Remove postinstall hack, use official plugin |
| Billing double-charge bug | Medium | Critical | Idempotency tests + integration tests |
| Tenant isolation breach | Low | Critical | Already well-implemented, but add negative tests |
| Rate limiter race condition | Medium | High | Migrate to official package |
| No backup for Convex state | Low | High | Document Convex's backup/restore process |
| Supply chain attack | Medium | Medium | Dependabot + npm audit weekly |
| Memory leak in file processing | Medium | Medium | Monitor Convex function memory usage |

---

## Final Recommendations

### What You're Doing Right ✅
- Tenant isolation via `requireSchoolMembership` middleware
- All webhooks are signature-verified (Paystack HMAC + Svix)
- Idempotency in payment processing
- Audit logging for compliance
- Environment gating (dev/preview/prod)

### What Will Fail At Scale ❌
- **Zero tests** will cause regression hell
- **No linting** means junior devs can ship inconsistent patterns
- **No caching** means you'll re-fetch the same data thousands of times
- **Synchronous long-running ops** will block requests
- **Windows-only CI** is false advertising for cross-platform Tauri

### The "Senior Engineer" Way
1. **Test-first culture** — write tests for every Convex function (90% coverage target)
2. **Lint in CI** — fail builds on warnings for security anti-patterns
3. **Cache aggressively** — React Query for client, Convex caching for server
4. **Background everything** — OCR, email, bulk imports go to queues
5. **Observability** — Sentry performance monitoring + Convex insights

---

## Appendix: Dependencies Audit

### Security-Vulnerable Packages (Check)
```
Cross-check these with `npm audit`:
- Tesseract.js (potential CVEs in image processing)
- pdf-parse (older version, may have DoS vulnerabilities)
- mammoth (XML parsing risk)
```

### Outdated Packages (⚠️)
```
Your package.json shows many ^ ranges — lock exact versions in CI:
- @clerk/nextjs: ^5.x (latest stable is 6.x)
- @convex-dev/auth: ^0.0.35 (check for newer)
- Mistral AI SDK: ^1.0.0 (you're on ^1.5.0, but lock to exact)
```

### Suggested Additions
```
- zod: ^3.23.8 (input validation)
- @tanstack/react-query: ^5.50.0 (client caching)
- vitest: ^2.0.0 (testing)
- @convex-dev/rate-limiter: ^0.0.4 (rate limiting)
- @convex-dev/test: ^0.0.7 (Convex testing)
- @playwright/test: ^1.44.0 (E2E)
- @sentry/replay: ^8.0.0 (user session recording)
```

---

*This review generated from static analysis and architectural evaluation. No runtime profiling was performed.*
```