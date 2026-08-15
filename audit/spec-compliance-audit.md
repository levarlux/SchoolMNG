# SchoolMNG — Audit Against `school-app-audit-spec.md`

**Date:** 2026-08-15
**Scope:** Full read-only audit of the existing codebase (Convex backend + Next.js/Tauri frontend) against the rebuild spec. Every spec item was checked against the live code. No files modified.
**Method:** Code inspection of `convex/schema.ts` (2,121 lines, ~90 tables), 124 Convex modules, 51 dashboard pages, EAV engine, and auth/billing/AI plumbing.

---

## Executive Summary

| Spec section | Overall verdict |
|---|---|
| §0 Core principle (nothing hardcoded, zero-default) | **VIOLATED** — the app is the opposite of the spec: ~90 hardcoded typed tables + a pre-seeded full module/section/field tree |
| §1 Six core pillars + Enrollment | **PARTIAL** — EAV engine + hidden typed core; Term not recursive; no Enrollment record |
| §2 Relationship model (Option A) | **VIOLATED** — no generic link mechanism; every relationship is a fixed per-feature table |
| §3 Generic engine | **PARTIAL** — real EAV engine + strong isolation, but import/EAV wiring is broken, no soft-delete, search misses custom fields, no template system |
| §4 Support modules + Finance | **PARTIAL** — modules exist but are hardcoded-table-driven; finance is not dynamic-field-driven; orphaned calc engine |
| §5 Analytics | **PARTIAL** — good default charts; **no chart customization at all** |
| §6 Onboarding | **PARTIAL** — Typeform-style + persistence; but a pre-checked suggested checklist over a pre-seeded tree, not a blank canvas |
| §7 Roles & Permissions | **PARTIAL** — permission engine built but **never enforced**; role names pre-seeded & keys hardcoded; dashboard not permission-composed |
| §8 Tiering | **PARTIAL** — discrete tiers + Paystack work; only ~2 of 6 spec signals used; never re-evaluated |
| §9 AI Agent | **PARTIAL** — agents are read-only proposers; no bypass of operator JWT on writes, but no section-level permission filtering of agent context |

**Build health:** `npx tsc --noEmit` fails with **8 type errors** (import-studio.tsx, intake-panel.tsx). `npm test` is a placeholder. The public student-import path has a **live contract bug**: EAV field values and per-row duplicate resolutions computed in the UI are silently dropped by the server action — custom-field import and the reconciliation UI are non-functional end-to-end.

**The single most consequential gap:** the spec's core principle — *"Nothing about the shape of a school's data is hardcoded… every school builds its own structure from a blank canvas"* — is directly contradicted by (a) the ~90-table hardcoded schema and (b) `seedFullTree.ts` pre-seeding ~20 modules / ~40+ sections / ~150+ fields into every school at provisioning. The EAV engine (records/fieldValues/modules/sections/fields + generic renderers) is real and functional, but only 1 of ~50 dashboard pages is driven by it; the rest are hardcoded per-feature pages over hardcoded tables.

---

## §0 Core Principle — VIOLATED

- The app hardcodes the *shape* of school data, not just the pillars. `convex/schema.ts` defines ~90 typed tables for specific features (health_records, books, fee_structures, exam_results, attendance, clinic_visits, boarding, transport, payroll-adjacent, etc.).
- Every school is pre-provisioned the full EAV structure: `convex/onboarding.ts:109-116` runs `internal.seedFullTree.seedFullTree` on every school; `convex/seedFullTree.ts:100-1006` is an exhaustive 5-bucket template (~20 modules, ~40+ sections, ~150+ fields), all tagged `isSystem: true` (`seedFullTree.ts:1051`).
- Contradiction with "no suggested field list, no pre-filled examples": the seed hands every school a pre-built "Bio Data: Full Legal Name, Date of Birth, Gender…", "Admission Info", "Medical Profile" allergies/medications, payroll, etc.

---

## §1 Six Core Pillars + Enrollment Record

### 1.1 Learner — PARTIAL
- EAV engine is real: `records`/`fieldValues`/`fields`/`modules`/`sections` (`schema.ts:355-465`); learner detail fields (gender, DOB, guardian…) genuinely EAV (`records.ts:239-278`, `studentEavLookup.ts`).
- But a **hardcoded typed core** exists: `students` table with `classId`, `firstName`, `lastName`, `admNo`, `status` union `active|graduated|withdrawn|suspended`, `photoUrl` (`schema.ts:99-123`). Documented as an internal linking/dedup/search core (`schema.ts:93-98`, `students.ts:18-20`), but status values and admission-number conventions are pre-written — a partial violation of "zero default fields".

### 1.2 Class — CONFORMS (per-class stream toggle)
- `classes.hasStreams: boolean` per row (`schema.ts:80-84`); `streams.classId` (`schema.ts:86-91`); toggle per class, not school-wide (`classes.ts:30-55`). Note: Class has no EAV fields at all (only name + hasStreams).

### 1.3 Subject — PARTIAL
- Standalone entity, created once, linked outward — conforms (`schema.ts:583-596`, `subjects.ts`).
- **Subject↔Class is NOT optional**: `teacher_subjects` requires `classId` (`schema.ts:667-676`). The spec's optional Subject↔Class (K-12 vs university) is not supported.
- `level` is a hardcoded CBC union (`pre_primary…general`, `schema.ts:587-594`) — contradicts zero-default (school cannot define its own levels).

### 1.4 Teacher — VIOLATES zero-default / PARTIAL symmetry
- **8 hardcoded typed columns**: `firstName, lastName, email, phone, staffNo, department, category` (`schema.ts:650-665`) — more columns than the stripped student core. Not EAV.
- M2M links: Teacher↔Subject↔Class via `teacher_subjects` (`schema.ts:667-676`). **No Teacher↔Learner link table** (spec requires it; only optional `parent_meetings.studentId` exists).
- Teacher↔Class independent of Subject: only via `teacher_subjects`/`timetable_entries` — not a standalone assignment.
- Symmetry with Learner: staff EAV records + import support exist (`records.teacherId` `schema.ts:487`; `imports.ts:233-248`), but **no Teacher 360° profile view** — the teachers page is a hardcoded table+form (`src/app/dashboard/teachers/page.tsx:26-80`).

### 1.5 Term / Period — PARTIAL
- **Not self-referencing/recursive**: `terms` is a flat table (`academicYearId, name, year, startDate, endDate, isCurrent, status`) — no `parentId` (`schema.ts:614-631`). Recursion exists only on `sections.parentId` (`schema.ts:382`). The spec's "Year → Semester → Term → Week → Day, any depth" is absent.
- Status current/past/upcoming: CONFORMS (`terms.ts:26-46,142-244`).
- Cross-cutting time axis: **partial** — Fee, Assessment, Class assignments, lesson plans, report cards, budgets are term-scoped; but `attendance` (`schema.ts:710-727`), `period_attendance` (`1123-1134`), discipline, health, clinic visits have **no termId**.

### 1.6 Assessment — CONFORMS (flat shape) / PARTIAL (reporting)
- Flat: `exam_results` one row = exam+student+subject+marks/grade/comment (`schema.ts:680-706`; `exams.ts:145-193` upserts per student+subject). Required links Learner/Subject/Term — CONFORMS.
- Multi-dimensional reporting: **largely absent** — no class/stream/subject rollup in the backend report surface; `exam_results` has no classId/streamId; results UI is a per-exam grid (`src/components/exam-results-view.tsx:40-80`); `comprehensiveReports.ts:485,553-554` only reaches term-level. Pass rates / subject-per-class / subject-per-stream rollups not built.

### 1.7 Enrollment Record — MISSING
- No `enrollment` table anywhere. Closest is `classAssignments` (student/class/stream/term, `schema.ts:636-646`) with **no status field**; the status lifecycle (active/graduated/withdrawn/suspended) lives on `students.status` (`schema.ts:106-113`), not an enrollment anchor. `admission_applications` (`schema.ts:1729-1753`) is intake, not enrollment.

---

## §2 Relationship Model ("Option A") — VIOLATED

- No generic link/relationship table exists. Every relationship is a fixed table with fixed validators + per-feature mutations: `teacher_subjects`, `guardian_links`, `classAssignments`, `student_activities`, `borrowings`, `parent_meetings`, `book_holds`…
- Closest thing is `staffAssignments` (`schema.ts:555-565`, `staffRecordId + assignmentType + targetId` free-string) — staff→target only, no FK enforcement.
- A school **cannot** create/remove/rewire an arbitrary link between any two entities.

---

## §3 The Generic Engine

### 3.1 Invisible system ID — PARTIAL
- Convex auto-generates `_id` at insert for every doc (`records.ts:94`, `students.ts:194`) — the invisible ID exists and is the anchor.
- But creation is **not** possible "before any field is filled": `records.create` requires `displayName` (`records.ts:85`); `students.create` requires name+class (`students.ts:43-46,183`).

### 3.2 Zero-default schema builder — VIOLATES (seeded), builder exists
- Builder exists and is good: `src/components/settings/structure-builder.tsx` (wired at `settings/page.tsx:568-583`); CRUD for modules/sections/fields with 8 input types + validation (`fields.ts:5-14`), recursive sections, options/aliases/required/enabled/sensitive (`schema.ts:355-447`).
- **Zero-default is violated by seeding** (see §0). "Nothing appears unless the school created it" is false; every school gets the whole tree.
- **Soft-delete MISSING**: `fields.remove` hard-deletes (`fields.ts:118-130`); there is no `deletedAt`/archive anywhere in `convex/`. Only `isEnabled=false` (hide) exists (`schema.ts:422`).

### 3.3 Upload / Import handling — PARTIAL, with CRITICAL wiring bugs
- Entity-type detection: CONFORMS — `detectFileKind` (`import-studio.tsx:310-333`, file-classifier 15 DocKinds), misfile badge (`import-studio.tsx:2319-2320,2435`).
- Misfile/cross-check prompt: CONFORMS.
- Row matching priority (ID → name → ask human): PARTIAL — admNo-first + name fallback exist (`imports.ts:428-459`, `marksImport.ts:173,211-216`); ambiguous-name rows are queued for human review in marks (`marksImport.ts:270`). Not confirmed for the general student path.
- New-field offer on unmapped columns: CONFORMS in the studio (`importCatalog.eavFields`), **but see the bug below**.
- Preview-before-commit: PARTIAL — counts shown (`import-studio.tsx:1500-1531`), but per-row decisions are dropped server-side.
- Type validation: present via field inputType validators (`fields.ts:5-14`).
- **CRITICAL BUG — EAV import + reconciliation are broken end-to-end:**
  - The UI builds `eavFields`, `studentResolutions`, `staffResolutions` and attaches them to the file payload (`import-studio.tsx:2029-2035`), but calls `importBatch({ schoolId, files, createMissingClasses, termName, termYear })` (`import-studio.tsx:2042-2048`).
  - `importBatch`'s args validator accepts **only** `files, createMissingClasses, termName, termYear` (`imports.ts:1087-1097`) and calls `importStudentsInternal` without `eavFields`/`resolutions` (`imports.ts:1106-1110`).
  - `importStudentsInternal` *does* accept `eavFields` + `resolutions` (`imports.ts:370-373`) and writes EAV (`:809/:866`) and honors overwrite (`:801`), so the machinery exists but is unreachable from the public path. Result: **custom-field values never import; the duplicate-resolution UI is cosmetic; `overwritten` is always 0**.
- **Import history bug**: student imports never record an `import_runs` row — `recordImportRunInternal` is only called by `marksImport.ts:272`, so the Files/Import-Runs library only ever shows marks imports.
- Missing/never-auto-delete reconciliation: import skips duplicates by default and never auto-deletes — the "Missing → flagged, never deleted" rule is only half-addressed (missing detection is not surfaced).

### 3.4 Single Source of Truth — PARTIAL
- EAV values live once against the record's invisible ID and are pulled live — good (`studentEavLookup.ts:24-43`).
- But the same real-world data exists in two places for the same learner: hardcoded typed modules (e.g. `health_records`, `fee_payments`) AND EAV "modules" (e.g. the seeded Finance fields `Current Balance`/`Overdue Amount` at `seedFullTree.ts:433` are plain stored `fieldValues` that can drift from the real ledger). `records.displayName` is denormalized (`schema.ts:470-497`).

### 3.5 Bulk Document Generation — MISSING (effectively)
- `convex/pdfGenerator.ts` has exactly 3 hardcoded layouts (report card `:16`, fee receipt `:207`, class list `:348`) with **zero callers** anywhere in the repo — unreachable dead code.
- No user-designable template system (no "design a document from your own fields" surface). The spec's core requirement is absent.

### 3.6 Global Search — PARTIAL
- Search is hardcoded to the typed core: students `firstName/lastName/admNo` search indexes (`schema.ts:121-123`) + `records.displayName` (`schema.ts:493-496`); `global-search.tsx:32-34` only calls `api.students.search`.
- **No search index over `fieldValues`/EAV exists** — the spec's "search dynamically across whatever fields the school has defined" is not met. Custom-field values are unsearchable.

### 3.7 Export — CONFORMS
- `src/lib/csv-export.ts:5-34` browser-download CSV (proper quoting/escaping); `exportData.ts:12-43` server export including a 7-alias EAV join; `export_runs` history (`exports.ts:13-46`); UI in bulk-operations + reports pages.

### 3.8 Bulk Edit — CONFORMS
- `convex/bulkOperations.ts`: bulk status update (`:18-41`, whitelist + per-id errors), bulk field update (`:184-233`, module-gated, audited), bulk delete (`:80-181`, chunked + audited). UI at `src/app/dashboard/bulk-operations/page.tsx`.

### 3.9 Audit Trail — PARTIAL
- Central `logAuditEntry` → `report_logs` (`helpers.ts:396-410`) with 100+ call sites; queryable `auditLog.ts:12-48`.
- **Not universal**: e.g. `updateReportCard`/`upsertLearningSupport` (`studentReports.ts:59-79,136-175`) don't log. Many entries log only counts (e.g. bulk updates log module/field/value totals, `bulkOperations.ts:60-67,223-229`) rather than changed values.

### 3.10 Data Isolation — CONFORMS (with caveats)
- Single Convex deployment; every table carries `schoolId` + `by_schoolId` index; all handlers gated by `requireSchoolMembership`/`requireActiveMembership`/`requireSchoolFromJwt` (JWT org_id, non-spoofable) (`helpers.ts:210-279`); webhooks verify signatures (svix + Paystack HMAC-SHA512 constant-time, `http.ts:44-74`).
- **Caveats / gaps:**
  - `studentReports.ts` `listReportCards` (`:15-24`), `listAcademicHistory` (`:83-92`), `getLearningSupport` (`:126-134`) query by bare `studentId` with no schoolId/membership check — cross-tenant read possible given a known studentId.
  - `aiAssistant.verifySchoolAccess` and `assistantAgent.proposeImport` accept a token **without org_id** (org check is skipped if `identity.org_id` is null) — comment acknowledged at `assistantAgent.ts:163-166`.

---

## §4 Support / Extra Modules + Finance

### 4.0 Module architecture — PARTIAL
- Optional toggleable modules exist on the EAV engine (`modules.isEnabled`, `seedFullTree` toggles, `onboarding.ts:417-432` disables unselected). Custom modules CONFORMS: `modules.create` sets `isCustom:true` (`modules.ts:54-63`), same rendering via `nav.ts:185` → generic `/dashboard/records?moduleId=`; no technical distinction from prebuilt.
- **But the optional modules' live data sources are hardcoded typed tables**, not EAV: fees → `fee_structures/fee_payments` (`fees.ts:471-561`), books → `books`, HR → `leave_requests/appraisals` (`hr.ts:10-42`), health → `health_records/clinic_visits` (`health/page.tsx:43-46`). The EAV records/fieldValues are a parallel side-channel.
- **Zero default fields: VIOLATES** — every module type ships pre-seeded fields (`seedFullTree.ts:425-440` finance, `:643-658` HR, `:750-760` library, `:239-401` health…). Activating Finance exposes pre-seeded fields, not blank ones.

### 4.1 Finance — mixed
- **Dynamic calculation engine / due-paid mapping: VIOLATES.** Expected = hardcoded `fee_structures.amount`, paid = hardcoded `fee_payments.amount`. No "designate which custom field = due / which = paid" mapping exists. The `semantic: "amount"` tag (`schema.ts:434-444`) is never applied to any seeded field, not settable by schools (`fields.ts:42-116`), and never read by any fee computation. `calcEngine.ts` is orphaned (imported nowhere) and **hardcodes `students.length * 5000`** as "total_expected" (`calcEngine.ts:338,346`).
- Difference over/under/exact: CONFORMS — `cleared/owing/overpaid/no_structure` per term (`fees.ts:106-121`), `getTermSummary` aggregates (`:272-303`).
- Term-scoped + carry-over: CONFORMS — credit carries forward across chronologically sorted terms (`fees.ts:96-110,234-267,424-445`); UI: "X in overpayment credit carried into this term" / "school owes KES X" (`fees/page.tsx:325-339`). (Both auto-credit and flagged surplus are surfaced — the spec's open decision #1 is effectively already decided.)
- Human-readable output: PARTIAL — badges/sentence fragments, no per-student generated sentences like "Paid 500 more than expected for Term 2."
- Live/reactive: PARTIAL — fees pages recompute on-the-fly from structures−payments with `useQuery` subscriptions (`fees.ts:7-10`, `fees/page.tsx:76-91`); but home dashboard serves a 1-hour cache (`dashboardCache.ts:6`, `dashboardStats.ts:19-30`), and the EAV Finance balance fields are plain stored values that can drift.
- Payroll/expenditures/budgets: PARTIAL — implemented (`payroll.ts:18-138`, `expenditures.ts:7-306`) but hardcoded; budgets are **never auto-reconciled** (`expenditures.ts:69-75` has a dead budget block; `spentAmount` only manually editable). `fee_structures.discounts/scholarship` are dead columns (never read).

---

## §5 Analytics & Visualization

- Default charts on relevant pages: CONFORMS for Learner performance, Attendance, Finance (dashboard `page.tsx:295-572`, analytics `page.tsx:202-533`, generic chart components `charts.tsx`).
- **Enrollment trends: MISSING** — no enrollment analytics anywhere (only marketing copy on `src/app/page.tsx:133`).
- **Chart customization: MISSING.** No chart-config storage in schema (no chart/widget table; only `dashboard_cache` and `analytics_snapshots`, both fixed-shape). Repo-wide grep for `chartType|chart_config|widgetConfig` = zero hits. No UI to remove/retarget/add charts. Charts are hardcoded per page (PARTIAL on the "generic pick chart type + filtered dataset" engine — generic *render* components exist, no *config* engine).

---

## §6 Onboarding

- Typeform-style flow + progress indicator + back navigation: CONFORMS (`onboarding-layout.tsx:49-61,137-155`; `page.tsx:626-628`).
- **Cannot advance past incomplete section: VIOLATES** — `nextStep()` (`page.tsx:606-624`) unconditionally advances; no required-field validation. The `*` on School Name (`:867`) is never enforced.
- Persistence/resume: CONFORMS — `onboarding_sessions.currentStep` (`schema.ts:2062-2089`, `onboarding.ts:189-243`), localStorage fallback (`page.tsx:459-475`).
- **Zero-default field selection: VIOLATES** — onboarding is a **pre-checked suggested checklist**, not a blank canvas. `getDefaultData()` sets **all** module/notification/role toggles to `true` (`page.tsx:398-449`); the school must actively uncheck. There is no field-building-from-scratch step in onboarding (grep for addField/customField in the onboarding page = zero). The tree is pre-seeded before any user choice (`onboarding.ts:109-116`).
- Import during onboarding with mapping assistance: CONFORMS — step 12 launches ImportStudio (`page.tsx:1970-2020`); AI-assisted mapping exists via `api.aiAssistant.suggestImportMapping` (`import-studio.tsx:1300-1331`, `aiAssistant.ts:457-622`), heuristic `autoMap` fallback, persisted per-kind mapping profiles (`import_mappings`).
- Tier signals: PARTIAL — headcount (`headcountLearners`) and modules (`enabledModules`) feed scoring; `headcountStaff` and `schoolType` are captured but **unused**; campuses and explicit establishment status are **absent**; boarding/facilities/fees proxy some signals (`tierAssignment.ts:84-142`).
- Nothing permanent: PARTIAL — configs are editable post-onboarding, but the seeded `isSystem` tree rows persist forever and "are not user-deletable as a whole" (`schema.ts:387`).

---

## §7 Roles & Permissions

- **Role names never predefined/suggested: VIOLATES.** `roles.ts:6-37` seeds 5 named roles (Principal, Teacher, Librarian, Bursar, Nurse) per school; the **role keys** `principal`/`teacher` are hardcoded throughout gates, nav, notifications, onboarding, and the PermissionGate default (`roles.ts:40`, `use-role.ts:13-14`, `helpers.ts:91-102`, `nav.ts:36-55`, `members.ts`, `invitations.ts`, `permissionAgent.ts:144`, `notificationRules.ts:109-149`, `PermissionGate.tsx:18`). Suggested prompts in the permissions UI literally read "Create a new role called Librarian…" (`permissions/page.tsx:43-50,107`). The display name is renameable (Principal → Headteacher), but the keys/names are pre-seeded, not typed from scratch.
- Permission structure independent of role name: PARTIAL — `resolveAccess` (`permissions.ts:12-51`) is purely roleId+node based (name-independent), but `requirePrincipal`, `PermissionGate`, `ROLE_HIERARCHY`, and the scope-rules leadership bypass all assume key `principal` ⇒ full access without consulting the permission table.
- Access at section level, per module, independently: PARTIAL — schema + mutations support module/section/field none/view/edit (`schema.ts:515-531`, `permissions.ts:142-236`), but the UI only ever grants **module** level (`permissions/page.tsx:295-301`), and **`resolveEffectiveAccess`/`checkAccess` are never called by any other function** — the permission engine is not enforced on any data read or mutation.
- Sections = same school-defined groupings: CONFORMS (permission nodeIds reference the same `sections` table built in the structure builder; `permissions.ts:58-79`).
- **Dashboards automatically composed per role: VIOLATES.** `dashboard/page.tsx` renders a fixed widget set; only Finance is gated, by the hardcoded `isLeadership` key (`page.tsx:296`). Nav is `isEnabled` + a hardcoded module-name allowlist (`nav.ts:36-55,175`); `nav.ts:11-16` explicitly comments permission-based filtering is "NOT wired here yet". No query to `api.permissions.*` anywhere on the dashboard.
- Flexible role assignment: PARTIAL — create/rename/delete custom roles + reassign members all work (`roles.ts:76-166`, `members.ts:132-168`), but core keys `principal`/`teacher` and all `isDefault` roles are undeletable (`roles.ts:136-139`), and the leadership role can never be assigned to or reassigned from anyone.
- Fail-closed default: PARTIAL — `resolveAccess` defaults to "none" (`permissions.ts:50`), but since nothing calls it, the live default is "any active member sees everything".
- Scope rules: **implemented but not enforced** — `scopeRules.ts:18-35` resolveScope + table (`schema.ts:536-550`) exist, but no data query calls them (grep: only self-references, role delete cascade, and the nav "not wired" comment). A teacher with `assigned_class` scope can still query every student.

---

## §8 Tiering

- Signals: PARTIAL — of the 6 spec signals, only **student population** (30%) and **modules activated** (25%) are used; the implementation adds facilities (20%), fee level (15%), boarding (10%) (`tierAssignment.ts:84-142`). **Staff headcount, campuses, institution type, and establishment status are not scored** (campuses/establishment don't even exist as fields; staff/institution are captured but unused).
- Model: **discrete tiers implemented** — Starter (0–39 / KES 7,000), Professional (40–74 / KES 22,000), Enterprise (75–100 / KES 175,000) (`tierAssignment.ts:27-78`), mapped to Paystack plan codes. The spec's open decision #2 is implicitly resolved toward discrete tiers, but per the spec it was never explicitly confirmed with the founder before building billing.
- Re-evaluation as the school grows: **MISSING** — `analyzeAndAssignTier` is only invoked from onboarding (`page.tsx:651`); `crons.ts` has only 3 jobs (analytics snapshot 24h, subscription expiry 6h, dashboard cache 1h) — **no periodic tier re-scoring**.
- Billing: CONFORMS — Paystack-only (no Stripe), checkout action (`paystack.ts`), HMAC-SHA512 webhook verification + idempotency (`http.ts`), `billing.hasAccess` paywall gate (`billing.ts:103-145`, `paywall.tsx`), 7-day trial, superadmin override with `tier_history` (`admin.ts:113`).

---

## §9 AI Agent

- Agent can take actions: PARTIAL — agents are **read-only proposers**, not actors. `aiAssistant.chat` never mutates data (`aiAssistant.ts` — only upserts session/rate-limit). `assistantAgent.proposeImport` builds an import proposal (`assistantAgent.ts:155-186`) that the **client executes after human approval** (`intake-panel.tsx:594`). `permissionAgent` proposes role changes the client applies (`permissionAgent.ts:128-147`). No server-side autonomous data mutation exists.
- **Agent inherits operator permissions (hard boundary): PARTIAL.** On the write path this is actually strong: mutations run under the operator's JWT, so `requirePrincipal`/`requireSchoolMembership` are enforced for whatever the human approves. But on the **read path there is no section-level filtering**: the chat agent's context pack (school totals, recent student names/admNos, enabled modules) is built regardless of the caller's permission scope (`aiSessions.getSchoolContext`), and non-leadership only gets a **prompt-level** instruction to "keep finance and counseling details out of your replies" (`aiAssistant.ts:133-138`). A staff member with library-only access can still get the agent to answer questions about any school data — a soft guideline, not the hard boundary the spec requires. The leadership check is also key-based (`LEADERSHIP_ROLE_KEY = "principal"`, `aiAssistant.ts:26`).
- Confirmation for high-impact actions: CONFORMS for imports (approve step). Deletions/bulk/financial agent actions don't exist, so N/A.
- Audit: PARTIAL — operator-executed actions are audited under the operator's identity; agent-only reads are not audited (arguably fine).
- Session isolation per school: CONFORMS — `ai_sessions` keyed by schoolId+userId+entryPoint (`schema.ts:2095-2109`), one Mistral conversation per school, "never use another school's data" guardrails (`aiAssistant.ts:75,122`).

---

## Tech Stack & Cross-Cutting

- Convex backend: CONFORMS. Next.js frontend: CONFORMS. Clerk auth + orgs: CONFORMS (`auth.config.ts`, `clerkWebhook.ts`, svix webhooks, `members` table from org membership). Tauri/Rust desktop shell: CONFORMS (`src-tauri/Cargo.toml`, `tauri.conf.json`, tauri-plugin-clerk). JS/TS throughout: CONFORMS.
- Multi-tenancy: single Convex deployment, row-level `schoolId` isolation (see §3.10 caveats).
- **Build health: FAIL** — `npx tsc --noEmit` → 8 errors:
  - `import-studio.tsx:1474,1481,1519,1520` — result shape mismatch (UI expects `students`/`staff` on the reconciliation query's return, which only has `{ matches }`).
  - `import-studio.tsx:1793,2146` — subject `level` type narrowing errors.
  - `intake-panel.tsx:288,315` — missing `level` in subjects payload; `skipped` absent from a stub action's return.
- Tests: `npm test` is an echo placeholder. No Convex-function or E2E tests.
- Dead/broken scaffolding: `importFeePayments`, `importSubjects`, `importClasses`, `importTerms` are no-op stubs returning empty results (`imports.ts:1153-1196`).

---

## Section 10 — Open Decisions Status

1. **Finance carry-over** (auto-credit vs flagged surplus): *implemented as both* — credit carries forward automatically and residual surplus is surfaced as "school owes" for manual action (`fees.ts:96-110,234-267`). Spec's open decision not formally confirmed, but a reasonable resolution is already built.
2. **Tiering model** (discrete vs continuous): *discrete implemented* (3 tiers, KES pricing via Paystack) — the spec explicitly says this should be confirmed before billing logic is built; treat as unconfirmed.
3. **Chart customization scope**: *unaddressed* — no customization exists at all; the priority list for which pages get full customization is undefined.

---

## Priority Fix Plan (ordered)

**P0 — Correctness / spec-critical:**
1. **Fix the import contract bug** — make `importBatch` accept and forward `eavFields` + `resolutions` to `importStudentsInternal` (`imports.ts:1087-1097` → `:1106-1110`), and have it call `recordImportRunInternal` so Files/Import-Runs works for all imports. Otherwise EAV import + duplicate reconciliation + import history are all dead.
2. **Fix the 8 tsc errors** (import-studio.tsx, intake-panel.tsx) — the app does not typecheck.
3. **Wire the permission engine into reads/mutations** (`resolveEffectiveAccess`/`requireViewAccess`/`requireEditAccess` into data queries + `resolveScope` into student/staff/record queries) and enforce fail-closed default (currently any active member sees everything). This is §7's core gap and a security issue.
4. **Remove hardcoded `"principal"`/`"teacher"` role keys from auth gates** or make the leadership key a per-school configurable value; stop seeding role names (respect §7 "names never predefined").
5. **Close tenant-isolation gaps**: add schoolId/membership guards to `studentReports.listReportCards/listAcademicHistory/getLearningSupport` (`studentReports.ts:15-24,83-92,126-134`) and require a JWT org on agent actions (`assistantAgent.ts:163-166`, `aiAssistant.ts:174-189`).

**P1 — Spec conformance:**
6. **Stop auto-seeding the full module/section/field tree** (`onboarding.ts:109-116` → `seedFullTree.ts`) so provisioning produces a blank canvas; onboarding steps 4–7 become blank-canvas field builders; only default *links* (not fields) pre-wired.
7. **Enrollment record** — add an `enrollments` anchor (Learner↔Term + status state machine), or promote `classAssignments` to it.
8. **Recursive Term/Period** — add `parentId` self-reference to `terms` (`schema.ts:614-631`).
9. **Generic link table** to satisfy §2 (create/rewire any entity pair), plus optional Subject↔Class.
10. **Soft-delete lifecycle** for fields/records (`fields.ts:118-130`) with permanent-delete confirmation.

**P2 — Feature depth:**
11. **Bulk document generation**: replace dead `pdfGenerator` with a template-from-own-fields system (or wire the 3 existing PDFs to UI at minimum).
12. **EAV search index** over `fieldValues` so global search covers custom fields (§3.6).
13. **Chart customization** (§5) — chart-config storage + per-page configure UI, starting with the 4 high-value pages (performance, attendance, finance, enrollment) + build the missing enrollment-trend analytics.
14. **Finance engine** on the generic semantic layer (`semantic:"amount"` mapping step → live calc) instead of hardcoded `fee_structures`; remove the orphaned hardcoded `calcEngine` fallback; auto-reconcile budgets.
15. **Tier re-evaluation cron** + use all 6 signals (add campuses + establishment status), and confirm the tiering/billing decision with the founder (§10 #2).
16. **AI agent hard-boundary**: build the context pack from the caller's *actual* resolved section permissions, not a leadership/non-leadership prompt.
17. Onboarding required-field validation (`page.tsx:606-624`) and per-section access granting UI (`permissions/page.tsx:295-301`).
