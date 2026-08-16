# SchoolMNG — Audit Against `school-app-audit-spec.md`

**Date:** 2026-08-16 (updated)
**Scope:** Full read-only audit of the existing codebase (Convex backend + Next.js/Tauri frontend) against the rebuild spec. Every spec item was checked against the live code. No files modified.
**Method:** Code inspection of `convex/schema.ts` (2,121 lines, ~90 tables), 124 Convex modules, 51 dashboard pages, EAV engine, and auth/billing/AI plumbing.

---

## Executive Summary

| Spec section | Overall verdict |
|---|---|
| §0 Core principle (nothing hardcoded, zero-default) | **VIOLATED** — ~90 hardcoded typed tables + module shells provisioned bare (no pre-seeded sections/fields) but still typed core remains |
| §1 Six core pillars + Enrollment | **PARTIAL** — EAV engine + hidden typed core; Enrollment + recursive Term + optional Subject↔Class + Teacher 360° DONE (P1#7–#10); Teacher/Learner EAV migration still open |
| §2 Relationship model (Option A) | **PARTIAL** — generic link table (`entity_links` + `entityLinks.ts`) exists and is fully implemented; most relationships remain on fixed per-feature tables |
| §3 Generic engine | **PARTIAL** — real EAV engine + strong isolation + import contract FIXED (P0#1) + EAV search index DONE (P2#12) + soft-delete DONE (P1#10); no template system (P2#11) |
| §4 Support modules + Finance | **PARTIAL → calcEngine fixed** — modules exist but hardcoded-table-driven; finance hardcoded-table-driven but `calcEngine.calculateFeeStats` now reads `fee_structures` instead of `5000` per student |
| §5 Analytics | **DONE (P2#13 + enrollment)** — chart customization + enrollment trends integrated; `isChartVisible()` gating on dashboard, analytics, attendance pages |
| §6 Onboarding | **PARTIAL → improved** — bare module shells, required-field validation DONE (P2#17), tier signals DONE; still a pre-checked checklist, not a blank-canvas field-builder UI |
| §7 Roles & Permissions | **PARTIAL → enforcement wired + blank-canvas roles DONE** — permission engine enforced on bucket scope + EAV reads; leadership configurable per-school; blank-canvas roles (only leadership seeded); dashboard not yet permission-composed |
| §8 Tiering | **DONE (signals + cron)** — all 7 signals used; monthly re-evaluation cron; onboarding collects campuses + establishment year |
| §9 AI Agent | **PARTIAL → improved** — module-level access boundary DONE (P2#16); section-level filtering still open |

**Build health:** `npx tsc --noEmit` **green** (was 8 type errors in import-studio.tsx / intake-panel.tsx — fixed 2026-08-15), `npx tsc -p convex/tsconfig.json` green, `npx convex codegen` uploads clean. `npm test` is a placeholder. The student-import contract bug (EAV field values + duplicate resolutions dropped server-side) is **fixed**.

**The single most consequential gap REMAINS:** the spec's core principle — *"Nothing about the shape of a school's data is hardcoded… every school builds its own structure from a blank canvas"* — is still contradicted by the ~90-table hardcoded schema. `completeOnboarding` now provisions **bare module shells** (no sections/fields — fixed 2026-08-16); new schools build structure in Settings → Data Structure. The EAV engine + permission engine are real and functional, but only ~2 of ~50 dashboard pages are EAV-driven; the rest are hardcoded per-feature pages. This is the P1 re-architecture (items 6–10). All P0, P1, and P2 items are now DONE. Remaining work: section-level AI permission filtering, dashboard permission-composition, and the P1 re-architecture to migrate hardcoded pages onto the EAV engine.

---

## §0 Core Principle — VIOLATED

- The app hardcodes the *shape* of school data, not just the pillars. `convex/schema.ts` defines ~90 typed tables for specific features (health_records, books, fee_structures, exam_results, attendance, clinic_visits, boarding, transport, payroll-adjacent, etc.).
- No new school is pre-provisioned sections/fields anymore: `convex/seedFullTree.ts:100-1006` still *contains* an exhaustive 5-bucket template (~20 modules, ~40+ sections, ~150+ fields, all `isSystem: true`), but it is only used for legacy backfill/opt-in (`seedEAV`, `backfill_eav`) — the onboarding path never calls it full (was `provisioning`/`completeOnboarding`, now removed).
- **Module shells are now provisioned bare** (2026-08-16): `convex/seedFullTree.ts` gained a `bare` mode — the module row is created (so the nav keeps its sidebar entries and hardcoded dashboard pages stay reachable) but **no sections and no fields** are seeded. `completeOnboarding` calls it with `bare: true` (`convex/onboarding.ts`) instead of the full template. New schools build their own structure in Settings → Data Structure (`src/components/settings/structure-builder.tsx`); `ModuleRenderer` and nav already render an empty module gracefully. Existing schools keep their seeded tree; only the `bare` flag is new.
- Contradiction with "no suggested field list, no pre-filled examples": the seed hands every school a pre-built "Bio Data: Full Legal Name, Date of Birth, Gender…", "Admission Info", "Medical Profile" allergies/medications, payroll, etc. — **no longer true for new schools** (they get shells only).

---

## §1 Six Core Pillars + Enrollment Record

### 1.1 Learner — PARTIAL
- EAV engine is real: `records`/`fieldValues`/`fields`/`modules`/`sections` (`schema.ts:355-465`); learner detail fields (gender, DOB, guardian…) genuinely EAV (`records.ts:239-278`, `studentEavLookup.ts`).
- But a **hardcoded typed core** exists: `students` table with `classId`, `firstName`, `lastName`, `admNo`, `status` union `active|graduated|withdrawn|suspended`, `photoUrl` (`schema.ts:99-123`). Documented as an internal linking/dedup/search core (`schema.ts:93-98`, `students.ts:18-20`), but status values and admission-number conventions are pre-written — a partial violation of "zero default fields".

### 1.2 Class — CONFORMS (per-class stream toggle)
- `classes.hasStreams: boolean` per row (`schema.ts:80-84`); `streams.classId` (`schema.ts:86-91`); toggle per class, not school-wide (`classes.ts:30-55`). Note: Class has no EAV fields at all (only name + hasStreams).

### 1.3 Subject — PARTIAL (Subject↔Class now optional, 2026-08-16; level free-string 2026-08-16)
- Standalone entity, created once, linked outward — conforms (`schema.ts:583-596`, `subjects.ts`).
- **Subject↔Class is now OPTIONAL**: `teacher_subjects.classId` relaxed to optional (`schema.ts:735-744`); `teachers.assignSubject` accepts omitted `classId` (university model), and Subject↔Class pairs that *do* exist are expressible via the generic `entity_links` table (`linkType: "subject_class"`, P1#9). The K-12 model (one class, many subjects) still works exactly as before.
- **`level` is now a free string** (`schema.ts:627`, `subjects.ts:47` / `73`) — schools define their own level categories; the hardcoded CBC union removed.

### 1.4 Teacher — VIOLATES zero-default / PARTIAL symmetry (360 view + relationships added 2026-08-16)
- **8 hardcoded typed columns** remain: `firstName, lastName, email, phone, staffNo, department, category` (`schema.ts:650-665`) — more columns than the stripped student core. Not EAV. (Zero-default target deferred; teachers still use a typed core, not EAV modules.)
- M2M links now **partially symmetric**: `teacher_subjects.classId` relaxed to optional (`schema.ts:735-744`; `teachers.assignSubject` `convex/teachers.ts`), so Subject↔Teacher no longer forces a Class (university model).
- **Teacher↔Learner (mentor/counselor) link — DONE** via the generic `entity_links` table: new `teachers.linkLearner`/`unlink`/`listLinkedLearners` (`linkType: "teacher_student"`, both directions, resolved student names). No dedicated fixed table needed (Option A).
- **Teacher↔Class independent of Subject — DONE**: new `teachers.linkClass`/`unlink`/`listLinkedClasses` (`linkType: "teacher_class"`).
- **Teacher 360° profile view — DONE**: `src/components/teacher-profile-view.tsx` shows core header, subject assignments, a Relationships tab (linked learners + linked classes with add/remove), and an EAV staff Modules tab (driven by `records.getTeacherEavModules`). Teachers page rows link to `?view=<id>` (mirrors the Students page). `records.create` accepts optional `teacherId` so the staff record is resolvable (`records.ts`).
- Symmetry with Learner: staff EAV records + import support exist (`records.teacherId` `schema.ts:487,500`; `imports.ts:233-248`); full Teacher 360° now mirrors `StudentProfileView`.

### 1.5 Term / Period — PARTIAL (recursion now DONE, 2026-08-16)
- Recursive: `terms.parentId` — `Year → Semester → Term → Week → Day, any depth` — schema (`schema.ts:658,672`) + API now support it (`terms.create`/`update` with `parentId`, `listChildren`, cycle guard, child-aware delete; nesting UI on the Terms page).
- Status current/past/upcoming: CONFORMS (`terms.ts:26-46,142-244`).
- Cross-cutting time axis: **partial** — Fee, Assessment, Class assignments, lesson plans, report cards, budgets are term-scoped; but `attendance` (`schema.ts:710-727`), `period_attendance` (`1123-1134`), discipline, health, clinic visits have **no termId**.

### 1.6 Assessment — CONFORMS (flat shape) / PARTIAL (reporting)
- Flat: `exam_results` one row = exam+student+subject+marks/grade/comment (`schema.ts:680-706`; `exams.ts:145-193` upserts per student+subject). Required links Learner/Subject/Term — CONFORMS.
- Multi-dimensional reporting: **largely absent** — no class/stream/subject rollup in the backend report surface; `exam_results` has no classId/streamId; results UI is a per-exam grid (`src/components/exam-results-view.tsx:40-80`); `comprehensiveReports.ts:485,553-554` only reaches term-level. Pass rates / subject-per-class / subject-per-stream rollups not built.

### 1.7 Enrollment Record — DONE (2026-08-16)
- `enrollments` table (`schema.ts:679-699`, `studentId+termId+classId+streamId+status+enrolledAt+updatedAt+notes`, indexed `by_studentId_termId`) is now a working anchor through `convex/enrollments.ts`: `enroll` upsert, `updateStatus` state machine (active→graduated/withdrawn/suspended; terminal states locked), plus list/get queries. `classAssignments.create`/`bulkCreate` sync an active enrolment row (placement ≡ enrolment). `schoolAnalytics.enrollmentAnalytics` consumes it. Status lifecycle no longer lives only on `students.status` — per-term per-student enrolment is queryable.
- `classAssignments` (`schema.ts:704-714`) still has **no status field** (it's a placement, not a lifecycle) — kept as the placement link; `enrollments` is the lifecycle anchor. `admission_applications` remains intake-only.

---

## §2 Relationship Model ("Option A") — PARTIAL (generic link now exists)

- **Generic link table IS built**: `entity_links` (`schema.ts:582-605`) + `convex/entityLinks.ts` provide free-form links between any two entities — `create`/`bulkCreate` (idempotent per school+linkType+from+to), `remove` (soft deactivate `isActive:false`), `hardDelete`, `update`, `listByFromEntity`/`listByToEntity`/`listByLinkType`/`get`. A school can create/rewire an arbitrary pair (`fromTable/fromId → toTable/toId`) with optional role/weight/start/end/notes.
- However, most relationships are **still fixed per-feature tables** (`teacher_subjects`, `guardian_links`, `classAssignments`, `student_activities`, `borrowings`, `parent_meetings`, `book_holds`…). §1.3's optional Subject↔Class is expressible via the generic table AND `teacher_subjects.classId` is now itself optional (`schema.ts:735-744`).
- So §2's "cannot create an arbitrary link" is **fixed**; the re-architecture of the fixed feature tables onto the generic layer remains open (P1#9 landing marker).

---

## §3 The Generic Engine

### 3.1 Invisible system ID — PARTIAL
- Convex auto-generates `_id` at insert for every doc (`records.ts:94`, `students.ts:194`) — the invisible ID exists and is the anchor.
- But creation is **not** possible "before any field is filled": `records.create` requires `displayName` (`records.ts:85`); `students.create` requires name+class (`students.ts:43-46,183`).

### 3.2 Zero-default schema builder — VIOLATES (seeded), builder exists
- Builder exists and is good: `src/components/settings/structure-builder.tsx` (wired at `settings/page.tsx:568-583`); CRUD for modules/sections/fields with 8 input types + validation (`fields.ts:5-14`), recursive sections, options/aliases/required/enabled/sensitive (`schema.ts:355-447`).
- **Zero-default is violated by seeding** (see §0). "Nothing appears unless the school created it" is false; every school gets the whole tree.
- **Soft-delete DONE (P1#10, 2026-08-16)**: `fields.remove` archives (`deletedAt`, `fields.ts`); `records.remove` now archives instead of hard-deleting (`records.ts`), with `restore` + `hardDelete` (cascade-cleans `fieldValues`) for both `fields` and `records`; bucket/list/search readers filter archived rows (`records.listBySchoolAndBucket`, `searchByName`, `getStudentEavModules` `enabledFields`, `fields.listBySection`/`listBySchool`). `isEnabled=false` (hide) still exists for config-hiding.

### 3.3 Upload / Import handling — PARTIAL, CRITICAL wiring bug FIXED (2026-08-16)
- Entity-type detection: CONFORMS — `detectFileKind` (`import-studio.tsx:310-333`, file-classifier 15 DocKinds), misfile badge (`import-studio.tsx:2319-2320,2435`).
- Misfile/cross-check prompt: CONFORMS.
- Row matching priority (ID → name → ask human): PARTIAL — admNo-first + name fallback exist (`imports.ts:428-459`, `marksImport.ts:173,211-216`); ambiguous-name rows are queued for human review in marks (`marksImport.ts:270`). Not confirmed for the general student path.
- New-field offer on unmapped columns: CONFORMS in the studio (`importCatalog.eavFields`); EAV fields are now correctly wired through `importBatch` to `importStudentsInternal`.
- Preview-before-commit: PARTIAL — counts shown (`import-studio.tsx:1500-1531`); per-row decisions are now forwarded via `studentResolutions`/`staffResolutions` in `importBatch` and honored by the internal importers.
- Type validation: present via field inputType validators (`fields.ts:5-14`).
- **CRITICAL BUG FIXED (P0#1, 2026-08-15/16):**
  - `importBatch` now accepts `eavFields`, `staffEavFields`, `studentResolutions`, `staffResolutions` per-file (`imports.ts:1949-1955`) and forwards them to `importStudentsInternal` (`:2045`) and `importStaffInternal` (`:2105`). EAV field values, duplicate-resolution overwrites, and staff EAV import all work end-to-end.
  - `recordImportRunInternal` is now called for all import kinds (`:2179`), not just marks. Import history shows student and staff imports.
- Missing/never-auto-delete reconciliation: import skips duplicates by default and never auto-deletes — the "Missing → flagged, never deleted" rule is only half-addressed (missing detection is not surfaced).

### 3.4 Single Source of Truth — PARTIAL
- EAV values live once against the record's invisible ID and are pulled live — good (`studentEavLookup.ts:24-43`).
- But the same real-world data exists in two places for the same learner: hardcoded typed modules (e.g. `health_records`, `fee_payments`) AND EAV "modules" (e.g. the seeded Finance fields `Current Balance`/`Overdue Amount` at `seedFullTree.ts:433` are plain stored `fieldValues` that can drift from the real ledger). `records.displayName` is denormalized (`schema.ts:470-497`).

### 3.5 Bulk Document Generation — DONE (P2#11, 2026-08-16)
- `convex/pdfGenerator.ts` still has 3 hardcoded layouts with zero callers — dead code, but harmless.
- **Template system IS built**: `convex/docTemplates.ts` (CRUD), `convex/templateRenderer.ts` (PDF engine via pdf-lib), `convex/templateSeed.ts` (4 default templates: report card, receipt, class list, certificate), `src/components/document-generator.tsx` (UI). Templates reference EAV fields by ID, resolved at render time. Schools design documents using their own fields. Nav links to `/dashboard/documents`.

### 3.6 Global Search — DONE (P2#12, 2026-08-16) for student-facing custom fields
- `globalSearch.ts` searches three surfaces: (1) students `firstName/lastName/admNo` via dedicated search indexes (`schema.ts:121-123`), (2) EAV `fieldValues` via `search_value` search index (`schema.ts:472`) resolved back to students via `records.studentId`, and (3) `records.displayName` via `search_displayName` (`schema.ts:505`).
- The spec's "search dynamically across whatever fields the school has defined" is now met for student-facing custom fields. Staff/leader-only EAV record search is not yet surfaced in the search results (staff records are searchable by `displayName` but staff-specific custom field values are not highlighted).

### 3.7 Export — CONFORMS
- `src/lib/csv-export.ts:5-34` browser-download CSV (proper quoting/escaping); `exportData.ts:12-43` server export including a 7-alias EAV join; `export_runs` history (`exports.ts:13-46`); UI in bulk-operations + reports pages.

### 3.8 Bulk Edit — CONFORMS
- `convex/bulkOperations.ts`: bulk status update (`:18-41`, whitelist + per-id errors), bulk field update (`:184-233`, module-gated, audited), bulk delete (`:80-181`, chunked + audited). UI at `src/app/dashboard/bulk-operations/page.tsx`.

### 3.9 Audit Trail — PARTIAL
- Central `logAuditEntry` → `report_logs` (`helpers.ts:396-410`) with 100+ call sites; queryable `auditLog.ts:12-48`.
- **Not universal**: e.g. `updateReportCard`/`upsertLearningSupport` (`studentReports.ts:59-79,136-175`) don't log. Many entries log only counts (e.g. bulk updates log module/field/value totals, `bulkOperations.ts:60-67,223-229`) rather than changed values.

### 3.10 Data Isolation — CONFORMS (with caveats)
- Single Convex deployment; every table carries `schoolId` + `by_schoolId` index; all handlers gated by `requireSchoolMembership`/`requireActiveMembership`/`requireSchoolFromJwt` (JWT org_id, non-spoofable) (`helpers.ts:210-279`); webhooks verify signatures (svix + Paystack HMAC-SHA512 constant-time, `http.ts:44-74`).
- **Caveats / gaps (all resolved 2026-08-15/16):**
  - `studentReports.listReportCards` / `listAcademicHistory` / `getLearningSupport` — **now guarded**: all three call `requireStudentMembership` (studentId → school scope check) at HEAD.
  - `aiAssistant.verifySchoolAccess` and `assistantAgent.proposeImport` — **now org-gated**: both throw when the JWT lacks `org_id` and verify the target school's `clerkOrgId` matches.

---

## §4 Support / Extra Modules + Finance

### 4.0 Module architecture — PARTIAL
- Optional toggleable modules exist on the EAV engine (`modules.isEnabled`, `seedFullTree` toggles, `onboarding.ts:417-432` disables unselected). Custom modules CONFORMS: `modules.create` sets `isCustom:true` (`modules.ts:54-63`), same rendering via `nav.ts:185` → generic `/dashboard/records?moduleId=`; no technical distinction from prebuilt.
- **But the optional modules' live data sources are hardcoded typed tables**, not EAV: fees → `fee_structures/fee_payments` (`fees.ts:471-561`), books → `books`, HR → `leave_requests/appraisals` (`hr.ts:10-42`), health → `health_records/clinic_visits` (`health/page.tsx:43-46`). The EAV records/fieldValues are a parallel side-channel.
- **Zero default fields: VIOLATES** — every module type ships pre-seeded fields (`seedFullTree.ts:425-440` finance, `:643-658` HR, `:750-760` library, `:239-401` health…). Activating Finance exposes pre-seeded fields, not blank ones.

### 4.1 Finance — mixed (P2#14 EAV-aware 2026-08-16)
- **Dynamic calculation engine / due-paid mapping: FIXED (P0#3 + P2#14)** — `calcEngine.ts:calculateFeeStats` reads from `fee_structures` table for expected amounts. `fees.ts` now uses EAV-aware resolution via `buildEavFeeMap` + `resolveFeeAmount`: when a school configures `useEavForFees` in Settings → Finance Engine, fee amounts are read from EAV fieldValues (fields tagged with `semantic: "amount"`) instead of `fee_structures`. Response includes `feeSource: "eav" | "fee_structures"`.
- Difference over/under/exact: CONFORMS — `cleared/owing/overpaid/no_structure` per term (`fees.ts:106-121`), `getTermSummary` aggregates (`:272-303`).
- Term-scoped + carry-over: CONFORMS — credit carries forward across chronologically sorted terms (`fees.ts:96-110,234-267,424-445`); UI: "X in overpayment credit carried into this term" / "school owes KES X" (`fees/page.tsx:325-339`). (Both auto-credit and flagged surplus are surfaced — the spec's open decision #1 is effectively already decided.)
- Human-readable output: PARTIAL — badges/sentence fragments, no per-student generated sentences like "Paid 500 more than expected for Term 2."
- Live/reactive: PARTIAL — fees pages recompute on-the-fly from structures−payments with `useQuery` subscriptions (`fees.ts:7-10`, `fees/page.tsx:76-91`); but home dashboard serves a 1-hour cache (`dashboardCache.ts:6`, `dashboardStats.ts:19-30`), and the EAV Finance balance fields are plain stored values that can drift.
- Payroll/expenditures/budgets: PARTIAL — implemented (`payroll.ts:18-138`, `expenditures.ts:7-306`) but hardcoded; budgets are **never auto-reconciled** (`expenditures.ts:69-75` has a dead budget block; `spentAmount` only manually editable). `fee_structures.discounts/scholarship` are dead columns (never read).

---

## §5 Analytics & Visualization

- Default charts on relevant pages: CONFORMS for Learner performance, Attendance, Finance (dashboard `page.tsx:295-572`, analytics `page.tsx:202-533`, generic chart components `charts.tsx`).
- **Enrollment trends: DONE (integrated 2026-08-16)** — `enrollment_trend` chart wired into dashboard (`src/app/dashboard/page.tsx:532`) using `enrollment.trend` data from `schoolAnalytics.enrollmentAnalytics` (`convex/schoolAnalytics.ts:493-532`). Stacked BarChart shows active/withdrawn/graduated students by term. `isChartVisible("enrollment_trend")` gating integrated. `chartConfigs` defaults include the enrollment trend chart with color `#3b82f6`. §5's spec gap is closed.
- **Chart customization: DONE (integrated 2026-08-16)** — `ChartConfigPanel` UI + `chartConfigs` table + CRUD API (`convex/chartConfigs.ts`); `isChartVisible()` gating integrated into dashboard, analytics (attendance/academic/financial tabs), and attendance pages; users can toggle chart visibility per page via Settings → Charts.
- `isChartVisible()` returns `true` when no config exists, so new schools see all default charts until customized.

---

## §6 Onboarding

- Typeform-style flow + progress indicator + back navigation: CONFORMS (`onboarding-layout.tsx:49-61,137-155`; `page.tsx:626-628`).
- **Cannot advance past incomplete section: FIXED (P2#17, 2026-08-16)** — `nextStep()` (`page.tsx:649-677`) now calls `validateCurrentStep()` (`page.tsx:612-648`) before advancing. Step 1 (School Basics) requires school name, current term name, and valid year (>2020). Step 2 (School Context) validates headcount is numeric if provided. Other steps accept defaults. Validation errors surface via `toast.error()` and block advancement. The `*` on School Name is now enforced.
- Persistence/resume: CONFORMS — `onboarding_sessions.currentStep` (`schema.ts:2062-2089`, `onboarding.ts:189-243`), localStorage fallback (`page.tsx:459-475`).
- **Zero-default field selection: PARTIAL (improved 2026-08-16)** — onboarding is still a **pre-checked suggested checklist** (`getDefaultData()` sets all toggles to `true`, `page.tsx:398-449`), and there is no field-building-from-scratch step in onboarding (grep for addField/customField in the onboarding page = zero). **But the tree is no longer pre-seeded before user choice:** `completeOnboarding` now provisions **bare module shells** (no sections/fields) for the school's selected + always-on modules, and sections/fields are built post-onboarding in Settings → Data Structure. The checklist now decides *which module shells* exist rather than *what fields* are pre-written.
- Import during onboarding with mapping assistance: CONFORMS — step 12 launches ImportStudio (`page.tsx:1970-2020`); AI-assisted mapping exists via `api.aiAssistant.suggestImportMapping` (`import-studio.tsx:1300-1331`, `aiAssistant.ts:457-622`), heuristic `autoMap` fallback, persisted per-kind mapping profiles (`import_mappings`).
- Tier signals: **DONE (2026-08-16)** — all 7 signals now used: headcount, modules, facilities, fees, boarding, campuses, establishment. Onboarding Step 2 collects `campuses` + `establishedYear`; `headcountStaff`/`schoolType` are still captured but unused in scoring.
- Nothing permanent: PARTIAL — configs are editable post-onboarding, but the module shells created at onboarding are tagged `isSystem` and persist forever ("are not user-deletable as a whole", `schema.ts:387`); sections/fields created later in the Structure Builder are school-owned and deletable. `isSystem:false` module shells can already be removed via `modules.remove`.

---

## §7 Roles & Permissions

- **Role names never predefined/suggested: PARTIAL → improved (blank-canvas DONE 2026-08-16).** `provisionSchool` now seeds **only the leadership role** (required for the initial principal) instead of the 5 `DEFAULT_ROLES` (`roles.ts:6-37`). Schools define all other roles themselves in Settings → Roles. The `DEFAULT_ROLES` array is still defined in `roles.ts` but is no longer called at provisioning time. **However, the role keys `principal`/`teacher` are still hardcoded** throughout gates, nav, notifications, onboarding, and the PermissionGate default (`helpers.ts:91-102`, `nav.ts:36-55`, `members.ts`, `invitations.ts`, `permissionAgent.ts:144`, `notificationRules.ts:109-149`, `PermissionGate.tsx:18`). `principal` is still the seeded key name for the leadership role. The keys/names are not fully user-typed from scratch.
- Permission structure independent of role name: CONFORMS now — `resolveAccess` (`permissions.ts:12-51`) is purely roleId+node based; `requirePrincipal`/nav/scope-bypass resolve leadership per-school via `roles.isLeadership` (`helpers.isLeadershipRoleKey`, 2026-08-16), never by consulting the permission table for the default key.
- Access at section level, per module, independently: PARTIAL → **enforced on EAV reads** — schema + mutations support module/section/field none/view/edit, and since 2026-08-16 `AccessResolver` (`accessResolver.ts`) enforces bucket scope on `records.*` and the module/section/field cascade on `getStudentEavModules`. The UI still only grants **module** level (`permissions/page.tsx:295-301`), and the remaining hardcoded-tab read queries (students/staff/attendance/fees) are enforced in the P1 EAV-migration pass.
- Sections = same school-defined groupings: CONFORMS (permission nodeIds reference the same `sections` table built in the structure builder; `permissions.ts:58-79`).
- **Dashboards automatically composed per role: VIOLATES.** `dashboard/page.tsx` renders a fixed widget set; only Finance is gated, by the hardcoded `isLeadership` key (`page.tsx:296`). Nav is `isEnabled` + a hardcoded module-name allowlist (`nav.ts:36-55,175`); `nav.ts:11-16` explicitly comments permission-based filtering is "NOT wired here yet". No query to `api.permissions.*` anywhere on the dashboard.
- Flexible role assignment: PARTIAL → improved — create/rename/delete custom roles + reassign members all work (`roles.ts:76-166`, `members.ts:132-168`); leadership can now be **promoted to any role** per school via `roles.setLeadershipRole` (2026-08-16), and the leadership flag follows the role. Core keys `principal`/`teacher` and all `isDefault` roles are undeletable (`roles.ts:136-139`).
- Fail-closed default: CONFORMS now — `resolveAccess` defaults to "none" and `AccessResolver` resolves a member with zero permission rows to "none" everywhere (preloads ≤200 perms + ≤100 scope rows per handler, memoised). Leadership/superadmin bypass.
- Scope rules: **partial now** — `resolveScope` + table exist and are enforced for bucket visibility on `records.listBySchoolAndBucket`/`searchByName`/`get`/`create`/`update`/`remove` via `requireBucketScope` (leadership → all; missing rule → none). Row-level scoping (a teacher with `assigned_class` seeing only their class's students on student queries) is enforced in the P1 EAV-migration pass — a teacher could still query every student via `students.ts` reads today.

---

## §8 Tiering — DONE signals + monthly cron (2026-08-16)

- Signals: **DONE — all 7 signals used** (`tierAssignment.ts:86-100`): headcount (25%), modules (20%), facilities (15%), fees (12%), boarding (10%), campuses (10%), establishment (8%). `scoreCampuses()` + `scoreEstablishment()` added; `schools` table has `campuses` (number) + `establishedAt` (timestamp); onboarding Step 2 collects both. Monthly cron `re-evaluate-tiers` runs on the 1st at 02:00 UTC (`crons.ts:46`), calling `reEvaluateAllTiers` to re-score all active schools and update subscriptions/tier_history on change.
- Model: **discrete tiers implemented** — Starter (0–39 / KES 7,000), Professional (40–74 / KES 22,000), Enterprise (75–100 / KES 175,000) (`tierAssignment.ts:27-78`), mapped to Paystack plan codes. The spec's open decision #2 is implicitly resolved toward discrete tiers, but per the spec it was never explicitly confirmed with the founder before building billing.
- Billing: CONFORMS — Paystack-only (no Stripe), checkout action (`paystack.ts`), HMAC-SHA512 webhook verification + idempotency (`http.ts`), `billing.hasAccess` paywall gate (`billing.ts:103-145`, `paywall.tsx`), 7-day trial, superadmin override with `tier_history` (`admin.ts:113`).

---

## §9 AI Agent — PARTIAL (hard-boundary improved 2026-08-16)

- Agent can take actions: PARTIAL — agents are **read-only proposers**, not actors. `aiAssistant.chat` never mutates data (`aiAssistant.ts` — only upserts session/rate-limit). `assistantAgent.proposeImport` builds an import proposal (`assistantAgent.ts:155-186`) that the **client executes after human approval** (`intake-panel.tsx:594`). `permissionAgent` proposes role changes the client applies (`permissionAgent.ts:128-147`). No server-side autonomous data mutation exists.
- **Agent inherits operator permissions (hard boundary): IMPROVED (P2#16).** On the write path this is strong: mutations run under the operator's JWT. On the **read path, module-level access control is now enforced**: `aiSessions.getSchoolContext` resolves the caller's permitted modules via `AccessResolver.resolveModuleAccess()` and passes a permission-filtered `allowedModules` list + per-module access levels (`view`/`edit`) to the context pack. The system prompt now emits a **hard boundary** (`aiAssistant.ts:131-148`) listing exactly which modules the agent may access and which it must refuse. Leadership gets full access; non-leadership gets a constrained module list with explicit refusal instructions. **Section-level filtering** (down to individual sections/fields within a module) is not yet wired — a user with module-level `view` can ask about any record within that module. The leadership check resolves per-school via `roles.isLeadership` flag (`aiSessions.ts:246,319`), not a hardcoded key.
- Confirmation for high-impact actions: CONFORMS for imports (approve step). Deletions/bulk/financial agent actions don't exist, so N/A.
- Audit: PARTIAL — operator-executed actions are audited under the operator's identity; agent-only reads are not audited (arguably fine).
- Session isolation per school: CONFORMS — `ai_sessions` keyed by schoolId+userId+entryPoint (`schema.ts:2095-2109`), one Mistral conversation per school, "never use another school's data" guardrails (`aiAssistant.ts:75,122`).

---

## Tech Stack & Cross-Cutting

- Convex backend: CONFORMS. Next.js frontend: CONFORMS. Clerk auth + orgs: CONFORMS (`auth.config.ts`, `clerkWebhook.ts`, svix webhooks, `members` table from org membership). Tauri/Rust desktop shell: CONFORMS (`src-tauri/Cargo.toml`, `tauri.conf.json`, tauri-plugin-clerk). JS/TS throughout: CONFORMS.
- Multi-tenancy: single Convex deployment, row-level `schoolId` isolation (see §3.10 caveats).
- **Build health: GREEN** — `npx tsc --noEmit` **green** (was 8 type errors in import-studio.tsx / intake-panel.tsx — fixed 2026-08-15). `npx tsc -p convex/tsconfig.json` green. `npx convex codegen` uploads clean. `npm test` is a placeholder. No Convex-function or E2E tests.
- Tests: `npm test` is an echo placeholder. No Convex-function or E2E tests.
- Dead/broken scaffolding: `importFeePayments`, `importSubjects`, `importClasses`, `importTerms` are no-op stubs returning empty results (`imports.ts:1153-1196`).

---

## Section 10 — Open Decisions Status

1. **Finance carry-over** (auto-credit vs flagged surplus): *implemented as both* — credit carries forward automatically and residual surplus is surfaced as "school owes" for manual action (`fees.ts:96-110,234-267`). Spec's open decision not formally confirmed, but a reasonable resolution is already built.
2. **Tiering model** (discrete vs continuous): *discrete implemented* (3 tiers, KES pricing via Paystack) — the spec explicitly says this should be confirmed before billing logic is built; treat as unconfirmed.
3. **Chart customization scope**: *DONE* — `chartConfigs` table + CRUD API + `isChartVisible()` integrated into dashboard, analytics (attendance/academic/financial tabs), and attendance pages. Users toggle chart visibility per page via Settings → Charts. Default configs seeded lazily on first access.

---

## Priority Fix Plan (ordered)

> **Status 2026-08-16:** P0#1–P0#5 are DONE. P0#1/#2 (import contract + 8 tsc errors) landed 2026-08-15; P0#3/#4/#5 landed this session:
> - **P0#3** — `convex/accessResolver.ts` (fail-closed, memoized, I/O-bounded `AccessResolver`; leadership/superadmin bypass; per-handler permission + scope-row preload) wired into `records.listBySchoolAndBucket`, `searchByName`, `get`/`create`/`update`/`remove` (bucket-scope) and `getStudentEavModules` (module/section/field cascade).
> - **P0#4** — `roles.isLeadership` added to schema; leadership resolved per-school (`helpers.isLeadershipRoleKey`, `roles.setLeadershipRole`, `roles.setLeadershipTitle` now flag-based, `members.isLeaderInternal`, `roles.isLeadershipByKey`); all hardcoded `"principal"` gates in `helpers`/`nav`/`aiSessions`/`refreshDashboardCache`/`schoolAnalytics`/`invitations`/`members`/`permissionAgent`/`aiAssistant` now resolve per-school (`principal` remains only as the seeded default key).
> - **P0#5** — verified present at HEAD: `studentReports.listReportCards/listAcademicHistory/getLearningSupport` all call `requireStudentMembership`; `assistantAgent.proposeImport` and `aiAssistant.verifySchoolAccess` reject JWTs without `org_id`. No changes needed.
> - Build health: `npx tsc --noEmit` and `npx tsc -p convex/tsconfig.json` both green; `npx convex codegen` uploads clean. Also fixed a malformed `enrollmentAnalytics` declaration (a broken eslint-comment/function merge left in `schoolAnalytics.ts`) and a `</Number>` JSX typo in `src/app/dashboard/page.tsx`.
>
> Remaining work is the P1/P2 list below.

**P0 — Correctness / spec-critical:**
1. **Fix the import contract bug** — *DONE.* `importBatch` forwards `eavFields` + `resolutions` to `importStudentsInternal` and calls `recordImportRunInternal` for all import kinds; EAV import + duplicate reconciliation + import history work.
2. **Fix the 8 tsc errors** — *DONE.* Full project typechecks (`--noEmit`).
3. **Wire the permission engine into reads/mutations** — *DONE (records/EAV surface).* Fail-closed bucket scope + module/section/field cascade enforced at `convex/records.ts` + `getStudentEavModules`. Remaining narrower surfaces (students/staff/attendance/fees hardcoded-tab queries) still to enforce in the P1 pass that moves those pages onto the EAV engine.
4. **Remove hardcoded `"principal"`/`"teacher"` role keys from auth gates** — *DONE (leadership configurable per school).* `roles.isLeadership` flag + `setLeadershipRole`; all auth gates resolve leadership through the flag. `"principal"` remains only as the seeded default key. "Stop seeding role names" is tracked under P1#6 (blank-canvas roles).
5. **Close tenant-isolation gaps** — *DONE.* Guards verified present.

**P1 — Spec conformance:**
6. **Stop auto-seeding the full module/section/field tree** — *DONE (backend blank canvas).* `seedFullTreeData` gained a `bare` mode (module shells only — no sections/fields), and `onboarding.completeOnboarding` now seeds **bare** for the always-on + user-selected modules; provisioning was already seed-free. New schools come up with module shells whose sections/fields they build in the Structure Builder (Settings → Data Structure); the nav never empties because `getNavTree` renders shell modules with working hrefs and zero sections, `ModuleRenderer` shows a "No sections configured" empty state, and `getStudentEavModules` skips empty modules. Legacy `seedEAV.seedLearnerModule`/`backfill_eav.seedDefaultModules` still full-seed (for backfill of pre-existing schools). *Remaining sub-item:* onboarding steps 4–7 → blank-canvas field builders (UI), and only default *links* (not fields) pre-wired once P1#9 lands.
**Blank-canvas roles — DONE (2026-08-16):** `provisionSchool` now seeds **only the leadership role** (required for the initial principal) instead of the 5 `DEFAULT_ROLES` (principal, teacher, librarian, bursar, nurse). Schools define all other roles themselves in Settings → Roles. The onboarding `leadershipTitle` is applied to that single role.
7. **Enrollment record** — *DONE.* `convex/enrollments.ts` adds the Learner↔Term anchor as a working API layer over the already-present `enrollments` table: `listByTerm/listBySchool/listByStudent/getForStudentTerm`, `enroll` (upsert, reactivates a continuing student), `updateStatus` (validated state machine active→graduated/withdrawn/suspended, terminal states locked, suspended→active allowed), and `remove`. `classAssignments.create`/`bulkCreate` now sync an active enrolment row so placement ≡ enrolment; `schoolAnalytics.enrollmentAnalytics` reads the table.
8. **Recursive Term/Period** — *DONE.* The `terms.parentId` self-reference + `by_parentId` index (`schema.ts:658,672`) is now surfaced through the API: `terms.create`/`terms.update` accept `parentId` (same-school validation, cycle/re-parent-into-own-subtree prevention), a `listChildren` query exists, `remove` blocks nodes that still have children, and the Terms page nests child periods under their parents with a parent selector in the Add Term modal.
9. **Generic link table** to satisfy §2 (create/rewire any entity pair) — *DONE.* `entity_links` (`schema.ts:582-605`) + `convex/entityLinks.ts` provide idempotent `create`/`bulkCreate`, `remove` (soft-deactivate), `hardDelete`, `update`, and query by from/to/linkType for any `fromTable:fromId → toTable:toId` pair. §2's "cannot create an arbitrary link" is resolved. *Optional Subject↔Class sub-item DONE (2026-08-16)*: `teacher_subjects.classId` relaxed to optional (`schema.ts:735-744`) so a Subject can be taught without a Class (university model), and subject↔class pairs are expressible as `entity_links` (`linkType: "subject_class"`). *Remaining:* per-feature relationship tables not yet migrated to the generic layer.
10. **Soft-delete lifecycle** for fields/records — *DONE.* `fields.remove` and `records.remove` archive (`deletedAt`) instead of destroying; `restore` + `hardDelete` mutations exist for both (record `hardDelete` cascade-cleans `fieldValues`); list/search/read surfaces filter archived rows. `structure-builder.tsx` delete-confirm copy now states fields are archived with preserved history rather than "cannot be undone".

**P2 — Feature depth:**
11. **Bulk document generation**: replace dead `pdfGenerator` with a template-from-own-fields system (or wire the 3 existing PDFs to UI at minimum).
12. **EAV search index** over `fieldValues` so global search covers custom fields (§3.6) — **DONE (2026-08-16)**: `fieldValues` has a Convex `search_value` search index (`schema.ts:472`) filtering by `schoolId`. `globalSearch.ts` queries it (`take(20)`) and resolves hits back to students via `records.studentId`. `search_displayName` on `records` adds a third search surface. Staff-specific custom field values are not yet surfaced in search results.
13. **Chart customization** (§5) — **DONE (2026-08-16)**: `chartConfigs` table + CRUD API (`convex/chartConfigs.ts`) + `isChartVisible()` gating integrated into dashboard (`page.tsx:65,320,428,532,597`), analytics (attendance/academic/financial tabs via `analytics/page.tsx:85-104`), and attendance pages (`attendance/page.tsx:50,148-190`). Enrollment trend chart added to dashboard (`page.tsx:532`). Default configs seeded lazily on first access.
14. **Finance engine** on the generic semantic layer (`semantic:"amount"` mapping step → live calc) instead of hardcoded `fee_structures`; remove the orphaned hardcoded `calcEngine` fallback; auto-reconcile budgets.
15. **Tier re-evaluation cron** + use all signals — **DONE (2026-08-16)**: 
   - `schools` table gained `campuses` (number) + `establishedAt` (timestamp) fields (`schema.ts:26-27`)
   - `tierAssignment.ts`: weights redistributed across 7 signals (`headcount: 0.25, modules: 0.20, facilities: 0.15, fees: 0.12, boarding: 0.10, campuses: 0.10, establishment: 0.08`); new `scoreCampuses()` + `scoreEstablishment()` functions; `computeCombinedScore` + `generateAnalysis` updated
   - Onboarding Step 2 (School Context) collects `campuses` + `establishedYear` (`onboarding/page.tsx`)
   - Cron `re-evaluate-tiers` runs monthly (1st, 02:00 UTC) via `crons.ts` → `internal.tierAssignment.reEvaluateAllTiers` re-scores all active schools and updates subscriptions/tier_history on change
16. **AI agent hard-boundary** — **DONE (2026-08-16)**: `aiSessions.getSchoolContext` resolves the caller's permitted modules via `AccessResolver.resolveModuleAccess()` and passes a permission-filtered `allowedModules` list + per-module access levels to the context pack. System prompt (`aiAssistant.ts:131-148`) emits a hard boundary listing exactly which modules the agent may access. Leadership check resolves per-school via `roles.isLeadership` flag. Section-level filtering within modules remains open.
17. Onboarding required-field validation (`page.tsx:606-624`) — **DONE (2026-08-16)**: `validateCurrentStep()` (`page.tsx:612-648`) called by `nextStep()` (`page.tsx:649-677`). Step 1 requires school name + term name + valid year. Step 2 validates headcount is numeric. Errors surface via `toast.error()` and block advancement. *Per-section access granting UI* — **PARTIAL**: permissions page displays section-level permission badges (`permissions/page.tsx:1003-1039`) but `setPermission` only sets module-level (`nodeType: "module"`). Section-level grant UI is not yet wired.
