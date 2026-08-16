# Changelog — SchoolMNG v0.2.0

**Release date:** 2026-08-16  
**Branch:** `stable-v0.2.0`

Major spec-conformance release addressing P0 (correctness), P1 (spec conformance), and P2 (feature depth) items from the spec compliance audit. 51 files changed, 5,073 insertions, 456 deletions across this release cycle.

---

## P0 — Correctness / Spec-Critical Fixes

### P0#1 — Import Contract Fix
- **Fixed:** `importBatch` now forwards `eavFields`, `staffEavFields`, `studentResolutions`, and `staffResolutions` to internal importers. EAV field values, duplicate-resolution overwrites, and staff EAV import all work end-to-end.
- **Fixed:** `recordImportRunInternal` is now called for all import kinds (student, staff, fees, marks), not just marks. Import history shows all import types.
- **Files:** `convex/imports.ts`

### P0#2 — TypeScript Build Health
- **Fixed:** All 8 type errors in `import-studio.tsx` and `intake-panel.tsx` resolved. `npx tsc --noEmit` now exits clean.
- **Files:** `src/components/import-studio.tsx`, `src/components/intake-panel.tsx`

### P0#3 — Permission Engine Enforcement
- **New:** `convex/accessResolver.ts` — fail-closed, memoized, I/O-bounded `AccessResolver` class. Resolves caller's role once, preloads ≤200 permissions + ≤100 scope rows per handler. Leadership/superadmin bypass.
- **Wired into:** `records.listBySchoolAndBucket`, `searchByName`, `get`/`create`/`update`/`remove` (bucket-scope) and `getStudentEavModules` (module/section/field cascade).
- **Files:** `convex/accessResolver.ts`, `convex/records.ts`

### P0#4 — Leadership Configurable Per School
- **New:** `roles.isLeadership` flag on the `roles` table. Leadership resolved per-school via `helpers.isLeadershipRoleKey()`, not a hardcoded `"principal"` key.
- **New:** `roles.setLeadershipRole` — promote any role to leadership per school.
- **Updated:** All hardcoded `"principal"` gates in `helpers`, `nav`, `aiSessions`, `refreshDashboardCache`, `schoolAnalytics`, `invitations`, `members`, `permissionAgent`, `aiAssistant` now resolve per-school.
- **Files:** `convex/schema.ts`, `convex/roles.ts`, `convex/helpers.ts`, + 10 modules

### P0#5 — Tenant-Isolation Gaps Closed
- **Fixed:** `studentReports.listReportCards/listAcademicHistory/getLearningSupport` now call `requireStudentMembership` (studentId → school scope check).
- **Fixed:** `aiAssistant.verifySchoolAccess` and `assistantAgent.proposeImport` now reject JWTs without `org_id` and verify the target school's `clerkOrgId` matches.
- **Files:** `convex/studentReports.ts`, `convex/aiAssistant.ts`, `convex/assistantAgent.ts`

---

## P1 — Spec Conformance

### P1#6 — Bare Module Seeding (Blank Canvas)
- **Changed:** `seedFullTree.ts` gained a `bare` mode — module rows are created (nav entries + hardcoded pages stay reachable) but **no sections and no fields** are seeded.
- **Changed:** `completeOnboarding` calls `seedFullTree` with `bare: true`. New schools build their own structure in Settings → Data Structure.
- **Changed:** `provisionSchool` now seeds **only the leadership role** (required for the initial principal) instead of 5 `DEFAULT_ROLES`. Schools define all other roles themselves.
- **Files:** `convex/seedFullTree.ts`, `convex/onboarding.ts`, `convex/roles.ts`

### P1#7 — Enrollment Record
- **New:** `convex/enrollments.ts` — Learner↔Term lifecycle anchor. `enroll` (upsert, reactivates continuing students), `updateStatus` (validated state machine: active→graduated/withdrawn/suspended, terminal states locked), `listByTerm`/`listBySchool`/`listByStudent`/`getForStudentTerm`.
- **New:** `classAssignments.create`/`bulkCreate` sync an active enrolment row (placement ≡ enrolment).
- **New:** `schoolAnalytics.enrollmentAnalytics` consumes the enrollment table.
- **Files:** `convex/enrollments.ts`, `convex/classAssignments.ts`, `convex/schoolAnalytics.ts`, `convex/schema.ts`

### P1#8 — Recursive Term/Period
- **New:** `terms.parentId` self-reference + `by_parentId` index. `terms.create`/`update` accept `parentId` with same-school validation and cycle/re-parent-into-own-subtree prevention.
- **New:** `terms.listChildren` query, child-aware `remove` (blocks nodes with children).
- **New:** Terms page nests child periods under parents with parent selector in Add Term modal.
- **Files:** `convex/terms.ts`, `convex/schema.ts`, `src/app/dashboard/terms/page.tsx`

### P1#9 — Generic Link Table (Option A)
- **New:** `entity_links` table + `convex/entityLinks.ts` — free-form links between any two entities. `create`/`bulkCreate` (idempotent), `remove` (soft-deactivate), `hardDelete`, `update`, queries by from/to/linkType.
- **New:** `teachers.linkLearner`/`unlink`/`listLinkedLearners` (teacher↔student mentor/counselor links).
- **New:** `teachers.linkClass`/`unlink`/`listLinkedClasses` (teacher↔class independent of subject).
- **Changed:** `teacher_subjects.classId` relaxed to optional (university model — Subject can be taught without a Class).
- **Changed:** Subject `level` changed from hardcoded CBC union to free string.
- **Files:** `convex/entityLinks.ts`, `convex/teachers.ts`, `convex/subjects.ts`, `convex/schema.ts`

### P1#10 — Soft-Delete Lifecycle
- **New:** `fields.remove` archives (`deletedAt`) instead of hard-deleting. `restore` + `hardDelete` mutations exist (hardDelete cascade-cleans `fieldValues`).
- **New:** `records.remove` archives instead of hard-deleting. `restore` + `hardDelete` mutations exist.
- **Changed:** Bucket/list/search/read surfaces filter archived rows. `isEnabled=false` (hide) still exists for config-hiding.
- **Files:** `convex/fields.ts`, `convex/records.ts`, `src/components/settings/structure-builder.tsx`

### Teacher 360° Profile View
- **New:** `src/components/teacher-profile-view.tsx` — core header, subject assignments, Relationships tab (linked learners + linked classes with add/remove), EAV staff Modules tab.
- **Changed:** Teachers page rows link to `?view=<id>` (mirrors Students page).
- **Changed:** `records.create` accepts optional `teacherId` so staff records are resolvable.
- **Files:** `src/components/teacher-profile-view.tsx`, `convex/records.ts`

---

## P2 — Feature Depth

### P2#11 — Document Templates (Template-from-Own-Fields)
- **New:** `convex/docTemplates.ts` — CRUD queries/mutations for document templates (`list`, `get`, `getDefault`, `create`, `update`, `remove`, `duplicate`).
- **New:** `convex/templateRenderer.ts` — PDF generation engine using pdf-lib. Reads template layout, resolves EAV field values + student typed core, generates PDF with school branding.
- **New:** `convex/templateSeed.ts` — Seeds 4 default templates per school (report card, receipt, class list, certificate). Idempotent. Called from onboarding + lazily from UI.
- **New:** `src/components/document-generator.tsx` — template selection by doc type, student selector, generate button, template duplicate/delete.
- **New:** `src/app/dashboard/documents/page.tsx` — documents page wired into dashboard nav.
- **Changed:** Nav: Documents module links to `/dashboard/documents`.
- **Files:** `convex/docTemplates.ts`, `convex/templateRenderer.ts`, `convex/templateQueries.ts`, `convex/templateSeed.ts`, `src/components/document-generator.tsx`, `src/app/dashboard/documents/page.tsx`, `convex/nav.ts`

### P2#12 — EAV Search Index
- **New:** `fieldValues` has a Convex `search_value` search index filtering by `schoolId`.
- **New:** `globalSearch.ts` queries the EAV index (`take(20)`) and resolves hits back to students via `records.studentId`. Custom-field values are now searchable.
- **New:** `records.search_displayName` index adds a third search surface.
- **Files:** `convex/schema.ts`, `convex/globalSearch.ts`

### P2#13 — Chart Customization
- **New:** `convex/chartConfigs.ts` — CRUD API for per-page chart configuration. `isChartVisible()` returns `true` when no config exists (new schools see all defaults).
- **New:** `chart_configs` table with `page`, `chartKey`, `chartType`, `title`, `isVisible`, `position`, `color`.
- **Changed:** `isChartVisible()` gating integrated into dashboard, analytics (attendance/academic/financial tabs), and attendance pages.
- **New:** Enrollment trend chart added to dashboard (stacked BarChart: active/withdrawn/graduated by term).
- **Files:** `convex/chartConfigs.ts`, `src/app/dashboard/page.tsx`, `src/app/dashboard/analytics/page.tsx`, `src/app/dashboard/attendance/page.tsx`, `convex/schema.ts`

### P2#14 — Finance Engine on Semantic Layer
- **New:** `convex/financeConfig.ts` — maps EAV fields to fee calculation roles (amount, due date, category, discount). `computeEavExpectedFees` resolves total expected from EAV fieldValues.
- **New:** `fee_config` table with `amountFieldId`, `dueDateFieldId`, `categoryFieldId`, `discountFieldId`, `useEavForFees`.
- **New:** `src/components/settings/finance-config.tsx` — settings UI for mapping EAV fields to fee roles.
- **Changed:** `calcEngine.ts` — `total_expected` and `collection_rate` check EAV config first, fallback to `fee_structures`.
- **Changed:** `fees.ts` — `buildEavFeeMap` + `resolveFeeAmount` helpers. `getTermSummary`, `listStudentFees`, `getStudentFees` all use EAV-aware resolution. Response includes `feeSource: "eav" | "fee_structures"`.
- **Files:** `convex/financeConfig.ts`, `convex/calcEngine.ts`, `convex/fees.ts`, `src/components/settings/finance-config.tsx`, `convex/schema.ts`, `src/app/dashboard/settings/page.tsx`

### P2#15 — Tier Re-Evaluation Cron + All Signals
- **Changed:** All 7 signals now used: headcount (25%), modules (20%), facilities (15%), fees (12%), boarding (10%), campuses (10%), establishment (8%).
- **New:** `scoreCampuses()` + `scoreEstablishment()` functions in `tierAssignment.ts`.
- **New:** `schools` table gained `campuses` (number) + `establishedAt` (timestamp) fields.
- **New:** Onboarding Step 2 collects `campuses` + `establishedYear`.
- **New:** Monthly cron `re-evaluate-tiers` runs on the 1st at 02:00 UTC.
- **Files:** `convex/tierAssignment.ts`, `convex/crons.ts`, `convex/schema.ts`, `src/app/onboarding/page.tsx`

### P2#16 — AI Agent Hard-Boundary
- **Changed:** `aiSessions.getSchoolContext` resolves caller's permitted modules via `AccessResolver.resolveModuleAccess()`. Passes permission-filtered `allowedModules` list + per-module access levels to context pack.
- **Changed:** System prompt emits a **hard boundary** listing exactly which modules the agent may access. Non-leadership gets explicit refusal instructions for restricted modules.
- **Changed:** Leadership check resolves per-school via `roles.isLeadership` flag (not hardcoded key).
- **Files:** `convex/aiAssistant.ts`, `convex/aiSessions.ts`

### P2#17 — Onboarding Required-Field Validation
- **New:** `validateCurrentStep()` in onboarding page. Step 1 requires school name + term name + valid year (>2020). Step 2 validates headcount is numeric.
- **Changed:** `nextStep()` calls `validateCurrentStep()` before advancing. Errors surface via `toast.error()` and block advancement.
- **Files:** `src/app/onboarding/page.tsx`

---

## Infrastructure & Quality

- **Build health:** `npx tsc --noEmit` green (was 8 errors). `npx tsc -p convex/tsconfig.json` green. `npx convex codegen` uploads clean.
- **Convex typecheck:** Fixed 10 strict type errors across `calcEngine.ts`, `marksImport.ts`, `paystack.ts`, `permissionAgent.ts` (implicit `any` types, circular references).
- **Schema additions:** `enrollments`, `entity_links`, `doc_templates`, `fee_config`, `chart_configs` tables.
- **Audit:** Full spec compliance audit updated to reflect all P0–P2 completions (`audit/spec-compliance-audit.md`).

---

## What's Next (Remaining Gaps)

| Gap | Priority | Description |
|---|---|---|
| §0 Core Principle | P1 re-arch | ~90 hardcoded tables vs. EAV engine. Only ~2 of ~50 pages are EAV-driven. |
| §7 Dashboard Composition | P1 | Fixed widget set, not role-driven. Nav has hardcoded module-name allowlist. |
| §9 Section-Level AI Filtering | P2 follow-up | Module-level done; section-level within a module still open. |
| §3.5 Legacy pdfGenerator | Cleanup | 3 hardcoded PDFs with zero callers (dead code, replaced by P2#11 templates). |
| §4.1 Budget Reconciliation | P2 follow-up | `expenditures.ts` has a dead budget block; `spentAmount` only manually editable. |
