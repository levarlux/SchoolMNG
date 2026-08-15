# SchoolMNG — Full Implementation Plan (Phase 0 → Release)

## Overview

This is the complete, ordered implementation plan to bring SchoolMNG into full compliance with `00-architecture.md`, `17-full-depth-module-template.md`, and `18-settings-module-builder-and-permissions.md`, **plus** two new cross-cutting UX mandates:

1. **Smooth page transitions** — every route change (sign-in, sign-up, onboarding, dashboard, admin, dev-admin, anywhere) fades in instead of hard-cutting.
2. **Custom brand loader** — a bespoke SchoolMNG loading animation (not the generic spinner circle) used for site startup, route loading, page-section loading, and button in-flight states.

**Current Status:** ~40% complete — core schema and basic CRUD exist, but enterprise-grade depth is missing across most modules.

**Target:** Enterprise-grade school management system that replaces spreadsheets, paper records, and third-party tools for every school function, with a polished, brand-consistent feel from first visit to daily use.

---

## Phase 0: Global UX Foundations (Priority: Critical)

This phase ships FIRST because every later phase reuses the transition system and the brand loader. It touches everything, so it also fixes the "everything feels unpolished / hard-cut" complaints immediately.

### 0.1 Page Transition System (fade-in on every navigation)

**Goal:** No hard cuts when moving between any pages. Each page fades in smoothly. Works for sign-in, sign-up, onboarding, dashboard, admin, dev-admin.

**Design:**

- **Primary mechanism — root `template.tsx`.** In Next.js App Router, a `template.tsx` remounts on every navigation (unlike `layout.tsx` which persists). A root `src/app/template.tsx` that wraps `children` in a `PageTransition` component gives a reliable fade-in **on every route change across the whole app** — auth, onboarding, dashboard, admin — with zero per-page changes.

- **`PageTransition` component** (`src/components/page-transition.tsx`, `"use client"`):
  - Renders `<div className="page-fade">` around children.
  - On mount, plays `page-fade-in` keyframes (opacity 0 → 1, translateY(8px) → 0, ~300ms `ease-out`).
  - Keys the wrapper div by `pathname` from `usePathname()` so a pathname change replays the animation.
  - Respects `prefers-reduced-motion` (skip animation).
  - Optional enhancement: crossfade via `document.startViewTransition` when available, falling back to CSS fade.

- **Supporting CSS** in `src/app/globals.css`:
  - `@keyframes pageFadeIn` / `.page-fade` (with `animation: pageFadeIn 0.3s ease-out`).
  - `@media (prefers-reduced-motion: reduce) { .page-fade { animation: none; } }`.

**Files:**

| File | Change |
|------|--------|
| `src/app/template.tsx` | **Create** — root template wrapping `children` in `PageTransition` |
| `src/components/page-transition.tsx` | **Create** — client fade-in wrapper |
| `src/app/globals.css` | Add `pageFadeIn` keyframes + reduced-motion guard |

**Acceptance criteria:**
- Navigating sign-in → onboarding → dashboard → any module page fades in (~300ms), never a hard cut.
- Hard refresh of any URL also fades in.
- `prefers-reduced-motion: reduce` users get instant, non-animated loads.

### 0.2 Custom Brand Loader (replaces generic spinners)

**Goal:** One bespoke, on-brand loading animation — a "book + graduation cap" mark that breathes/pulses with the school's brand colors — used everywhere a spinner currently exists.

**Design — `src/components/ui/brand-loader.tsx`:**

- A `BrandLoader` component with variants:
  - `variant="dots"` (small, for buttons/inline) — three animated dots in brand primary/secondary, with a custom `brand-bounce` keyframe.
  - `variant="book"` (medium, for section/panel loading) — an animated open-book / graduation-cap SVG with a soft glow pulse + shimmer sweep.
  - `variant="full"` (large, for page/route loading) — the book mark centered over the brand gradient with the SchoolMNG wordmark and a subtle animated gradient underneath (reuses `AnimatedGradient` concept).
- Props: `variant`, `size` (`sm`/`md`/`lg`), optional `label` (e.g. "Loading your school…").
- Accessible: `role="status"`, `aria-live="polite"`.
- Uses the CSS variables already in `globals.css` (`--school-primary`, `--school-secondary`) so it themes per school.

**Supporting CSS** in `globals.css`:
- `@keyframes brand-bounce`, `@keyframes brand-glow` (pulse opacity/scale), `@keyframes brand-shimmer` (gradient sweep), `@keyframes brand-gradiant-flow`.

**Where it replaces the generic spinner (100+ `Loader2`/`animate-spin` occurrences):**

| Location | Change |
|----------|--------|
| `src/app/layout.tsx` root `<Suspense fallback>` (currently plain `"Loading…"` div) | → `<BrandLoader variant="full" />` |
| `src/app/loading.tsx` | **Create** — `BrandLoader variant="full"` for root route suspense |
| `src/app/dashboard/loading.tsx` | **Create** — full-page brand loader |
| `src/app/onboarding/loading.tsx` | **Create** — full-page brand loader |
| `src/app/sign-in` / `sign-up` route loading | **Create** — `loading.tsx` with full loader |
| `src/app/admin/loading.tsx`, `src/app/dev-admin/loading.tsx` | **Create** |
| All `src/app/dashboard/**/page.tsx` `Loader2 … animate-spin` inline loaders | → `<BrandLoader variant="book" size="md" />` |
| All buttons with `{loading && <Loader2 … animate-spin />}` | → `<BrandLoader variant="dots" size="sm" />` (spinning dot shimmer, still in brand colors) |
| `src/components/ai-chat.tsx` loading row | → `<BrandLoader variant="dots" size="sm" />` |
| `src/components/import-studio.tsx`, `document-scanner.tsx`, `paywall.tsx`, `tier-comparison.tsx`, `fee-payment-modal.tsx`, `global-search.tsx`, generic renderers | → BrandLoader variants |

**Acceptance criteria:**
- Zero `Loader2` + `animate-spin` combinations remain in `src/`.
- Startup, route-level, section-level, and button-level loading all use the custom mark.
- Loader adopts the school's configured brand colors.

---

## Phase 1: Foundation Fixes (Priority: Critical)

### 1.1 Flexible Leadership Role Naming

**Problem:** "Principal" is hardcoded as a string literal in auth gates, the sidebar, and permission checks. Schools use different titles: Headmaster, Director, Head Teacher, Rector, etc.

**Root cause (verified in code):**
- `convex/helpers.ts:85` — `type MemberRole = "teacher" | "principal"`, `ROLE_HIERARCHY` keyed on those literals.
- `convex/helpers.ts:141` — `requirePrincipal` compares the literal string.
- `src/lib/use-role.ts:8` — `MemberRole` union of the same two literals; `isAtLeast` uses a hardcoded hierarchy.
- `src/components/dashboard-layout.tsx` — `navItems` use `minRole: "principal"`.
- `convex/roles.ts:111` — `remove` **throws** for `isDefault` roles, so "Principal" can never be renamed via the existing UI.
- `members.role` stores a raw string disconnected from the `roles` table.

**Design — stable key + editable display name:**

- Add a stable `key` to the `roles` table (`"principal"`, `"teacher"`, `"librarian"`, `"bursar"`, `"nurse"`, …). Auth gates check **`key`**; all UI shows the editable **`name`**.
- Add `leadershipTitle: v.optional(v.string())` to `schools` (the display label for the leadership role, e.g. "Headteacher").

**Changes Required:**

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `key` to `roles`; add `leadershipTitle` to `schools` |
| `convex/roles.ts` | Allow renaming non-`key` fields (including `isDefault` roles); seed roles with stable `key`s; add `setLeadershipTitle` mutation |
| `convex/helpers.ts` | Replace `requirePrincipal` with `requireLeadership(ctx, schoolId)` that resolves the leadership role by key; add `getLeadershipRoleName(ctx, schoolId)` |
| `convex/members.ts` | Store role by `key`; expose display name lookup |
| `convex/onboarding.ts` | Capture custom leadership title in onboarding (Step: Staff Accounts), write to `schools.leadershipTitle` + the role's `name` |
| `src/lib/use-role.ts` | Keep the two-literal fast path for member role keys, but return the **display name** for UI; add `useLeadershipTitle()` |
| `src/components/dashboard-layout.tsx` | Use display title in nav/header instead of literal "Principal" |
| `src/components/generic/PermissionGate.tsx` | Check against role `key`, not literal |
| All pages checking `role === "principal"` | Update to key-based check; display the configured title |

**Acceptance criteria:**
- A school that sets "Headteacher" sees "Headteacher" everywhere the word "Principal" used to appear.
- The role can be renamed from Settings → Roles after onboarding.
- Permission gates still behave identically after a rename.

### 1.2 EAV Metadata Seeding

**Problem:** `modules`, `sections`, `fields` tables exist with full CRUD (`convex/modules.ts`, `convex/sections.ts`, `convex/fields.ts`) but have **no seed data** — schools start with empty structures.

**Changes Required:**

| File | Change |
|------|--------|
| `convex/seedEAV.ts` | **Create** — deterministic, idempotent seed of every module/section/field per doc 17, tagged `isSystem: true` so school edits are separate |
| `convex/schema.ts` | Add `isSystem`/`isCustom` distinction to modules/sections/fields; add `parentId` to sections for recursive nesting (subsections like "Core Medical Identity") |
| `convex/onboarding.ts` | Call `seedEAV` after school creation |
| `convex/backfill_eav.ts` | Extend to populate `records`/`fieldValues` from existing students/teachers rows |

**Seed Data Structure (per `17-full-depth-module-template.md` — full Learners bucket):**

```
Bucket: Learners
├── Module: Student Record
│   ├── Section: Bio Data
│   │   ├── Field: Full Legal Name (text_short)
│   │   ├── Field: Preferred Name (text_short)
│   │   ├── Field: Date of Birth (date)
│   │   ├── Field: Gender (dropdown_single: male/female/other)
│   │   ├── Field: Photo (file)
│   │   ├── Field: Place of Birth (text_short)
│   │   ├── Field: Nationality (text_short)
│   │   ├── Field: National ID/Birth Cert Number (text_short)
│   │   ├── Field: Home Address (text_long)
│   │   ├── Field: County/Region (text_short)
│   │   ├── Field: GPS Coordinates (text_short)
│   │   ├── Field: Languages Spoken (text_short)
│   │   ├── Field: Religion (dropdown_single)
│   │   ├── Field: Blood Group (dropdown_single)
│   │   └── Field: Physical Features (text_long)
│   ├── Section: Admission Info
│   │   ├── Field: Admission Number (text_short)
│   │   ├── Field: Admission Date (date)
│   │   ├── Field: Class/Grade (dropdown_single)
│   │   ├── Field: Stream/Section (dropdown_single)
│   │   ├── Field: Roll Number (number)
│   │   ├── Field: Admission Type (dropdown_single: new/transfer/re-admission)
│   │   ├── Field: Previous School (text_short)
│   │   ├── Field: Subjects Enrolled (dropdown_multi)
│   │   ├── Field: Admission Status (dropdown_single: active/inactive/graduated/withdrawn/transferred-out)
│   │   ├── Field: Withdrawal Reason (text_long)
│   │   └── Field: Withdrawal Date (date)
│   ├── Section: Guardian Link
│   │   ├── Field: Primary Guardian Name (text_short)
│   │   ├── Field: Relationship (dropdown_single)
│   │   ├── Field: Guardian Phone (text_short)
│   │   ├── Field: Guardian Email (text_short)
│   │   ├── Field: Secondary Guardian (text_short)
│   │   ├── Field: Custody Notes (text_long)
│   │   ├── Field: Guardian Occupation (text_short)
│   │   └── Field: Preferred Contact Method (dropdown_single)
│   └── Section: Identification Documents
│       ├── Field: Birth Certificate (file)
│       ├── Field: National ID/Passport (file)
│       ├── Field: Passport Photo (file)
│       └── Field: Immunization Card (file)
├── Module: Academics
│   ├── Section: Timetable
│   │   └── (References timetable_entries table)
│   ├── Section: Grades/Exams
│   │   ├── Subsection: Continuous Assessment
│   │   │   ├── Field: CAT Score (number)
│   │   │   ├── Field: Assignment Score (number)
│   │   │   └── Field: Project Score (number)
│   │   ├── Subsection: Term Exams
│   │   │   ├── Field: Exam Score (number)
│   │   │   ├── Field: Exam Type (dropdown_single)
│   │   │   ├── Field: Total Marks (number)
│   │   │   ├── Field: Percentage (number)
│   │   │   ├── Field: Grade (dropdown_single)
│   │   │   ├── Field: Class Rank (number)
│   │   │   ├── Field: Stream Rank (number)
│   │   │   └── Field: Overall Rank (number)
│   │   └── Subsection: Standardized Exams
│   │       ├── Field: Registration Number (text_short)
│   │       └── Field: Results (text_long)
│   ├── Section: Report Cards
│   │   ├── Field: Report Card PDF (file)
│   │   ├── Field: Teacher Comment (text_long)
│   │   ├── Field: Headteacher Comment (text_long)
│   │   ├── Field: Attendance Summary (text_short)
│   │   ├── Field: Promotion Recommendation (dropdown_single)
│   │   └── Field: Parent Acknowledged (boolean)
│   ├── Section: Academic History
│   │   └── (References classAssignments table)
│   └── Section: Learning Support
│       ├── Field: Special Needs Flag (boolean)
│       ├── Field: IEP Notes (text_long)
│       ├── Field: Remedial Class (boolean)
│       └── Field: Gifted Program (boolean)
├── Module: Attendance
│   ├── Section: Daily Attendance
│   │   └── (References attendance table)
│   ├── Section: Period-Level Attendance
│   │   ├── Field: Present Per Period (boolean)
│   │   ├── Field: Subject (dropdown_single)
│   │   └── Field: Recorded By (text_short)
│   ├── Section: Absence Log
│   │   ├── Field: Absence Reason (dropdown_single)
│   │   ├── Field: Supporting Document (file)
│   │   ├── Field: Excused (boolean)
│   │   └── Field: Parent Notified (boolean)
│   └── Section: Attendance Summary
│       ├── Field: Term Percentage (number)
│       ├── Field: Year-to-Date Percentage (number)
│       └── Field: Chronic Absenteeism (boolean)
├── Module: Library
│   ├── Section: Borrow Log
│   │   └── (References borrowings table)
│   ├── Section: Fines/Status
│   │   └── (References fines table)
│   ├── Section: Reading History
│   │   └── (References borrowings table with status=returned)
│   └── Section: Reservations
│       └── (References book_holds table)
├── Module: Health/Welfare
│   ├── Section: Medical Profile
│   │   ├── Subsection: Core Medical Identity
│   │   │   ├── Field: Blood Type (dropdown_single)
│   │   │   ├── Field: Rh Factor (dropdown_single)
│   │   │   ├── Field: Weight (number)
│   │   │   ├── Field: Height (number)
│   │   │   ├── Field: BMI (number, auto-calc)
│   │   │   ├── Field: Last Physical Exam (date)
│   │   │   ├── Field: Physician Name (text_short)
│   │   │   ├── Field: Physician Phone (text_short)
│   │   │   ├── Field: Insurance Provider (text_short)
│   │   │   ├── Field: Policy Number (text_short)
│   │   │   └── Field: Insurance Expiry (date)
│   │   ├── Subsection: Allergies (repeatable)
│   │   │   ├── Field: Allergen Name (text_short)
│   │   │   ├── Field: Category (dropdown_single)
│   │   │   ├── Field: Severity (dropdown_single)
│   │   │   ├── Field: Reaction (text_long)
│   │   │   ├── Field: Emergency Medication Required (boolean)
│   │   │   └── Field: Medication Location (text_short)
│   │   ├── Subsection: Chronic Conditions (repeatable)
│   │   │   ├── Field: Condition Name (text_short)
│   │   │   ├── Field: ICD-10 Code (text_short)
│   │   │   ├── Field: Diagnosis Date (date)
│   │   │   ├── Field: Severity (dropdown_single)
│   │   │   ├── Field: Management Plan (text_long)
│   │   │   └── Field: Activity Restrictions (text_long)
│   │   ├── Subsection: Current Medications (repeatable)
│   │   │   ├── Field: Medication Name (text_short)
│   │   │   ├── Field: Dosage (text_short)
│   │   │   ├── Field: Frequency (dropdown_single)
│   │   │   ├── Field: Route (dropdown_single)
│   │   │   ├── Field: Prescribing Physician (text_short)
│   │   │   ├── Field: Start Date (date)
│   │   │   ├── Field: End Date (date)
│   │   │   └── Field: Administered at School (boolean)
│   │   ├── Subsection: Immunization Record (repeatable)
│   │   │   ├── Field: Vaccine Name (text_short)
│   │   │   ├── Field: Dose Number (number)
│   │   │   ├── Field: Date Administered (date)
│   │   │   ├── Field: Provider (text_short)
│   │   │   ├── Field: Batch Number (text_short)
│   │   │   ├── Field: Next Due Date (date)
│   │   │   └── Field: Compliance Status (dropdown_single)
│   │   ├── Subsection: Disability & Accessibility
│   │   │   ├── Field: Disability Type (text_short)
│   │   │   ├── Field: Diagnosis Documentation (file)
│   │   │   ├── Field: Accommodations Required (dropdown_multi)
│   │   │   └── Field: Assistive Devices (text_long)
│   │   ├── Subsection: Dietary & Nutrition
│   │   │   ├── Field: Restriction Type (dropdown_single)
│   │   │   ├── Field: Specific Restriction (text_long)
│   │   │   └── Field: Nutritionist Notes (text_long)
│   │   └── Subsection: Family/Emergency Medical Context
│   │       ├── Field: Family Medical History (text_long)
│   │       ├── Field: Emergency Medical Contact (text_short)
│   │       ├── Field: Medical Consent on File (boolean)
│   │       └── Field: Special Directives (text_long)
│   ├── Section: Clinic Visits
│   │   └── (References clinic_visits table)
│   ├── Section: Screenings & Growth Monitoring
│   │   ├── Subsection: Vision Screening
│   │   │   ├── Field: Screening Date (date)
│   │   │   ├── Field: Screened By (text_short)
│   │   │   ├── Field: Result (dropdown_single)
│   │   │   ├── Field: Left Eye Acuity (text_short)
│   │   │   ├── Field: Right Eye Acuity (text_short)
│   │   │   └── Field: Corrective Lenses (boolean)
│   │   ├── Subsection: Hearing Screening
│   │   │   ├── Field: Screening Date (date)
│   │   │   ├── Field: Left Ear Result (dropdown_single)
│   │   │   └── Field: Right Ear Result (dropdown_single)
│   │   ├── Subsection: Dental Checkup
│   │   │   ├── Field: Checkup Date (date)
│   │   │   ├── Field: Dentist/Clinic (text_short)
│   │   │   ├── Field: Findings (text_long)
│   │   │   └── Field: Treatment Recommended (text_long)
│   │   └── Subsection: Growth Tracking (repeatable)
│   │       ├── Field: Date (date)
│   │       ├── Field: Height (number)
│   │       ├── Field: Weight (number)
│   │       ├── Field: BMI (number, auto-calc)
│   │       └── Field: Percentile (number, auto-calc)
│   ├── Section: Counseling
│   │   ├── Subsection: Session Log (repeatable, sensitive)
│   │   │   ├── Field: Session Date (date)
│   │   │   ├── Field: Counselor Name (text_short)
│   │   │   ├── Field: Session Type (dropdown_single)
│   │   │   ├── Field: Presenting Concern (text_long)
│   │   │   ├── Field: Session Notes (text_long, sensitive)
│   │   │   ├── Field: Risk Level (dropdown_single)
│   │   │   └── Field: Safety Plan on File (boolean)
│   │   ├── Subsection: Referrals
│   │   │   ├── Field: External Referral Made (boolean)
│   │   │   ├── Field: Referred To (text_short)
│   │   │   ├── Field: Reason (text_long)
│   │   │   └── Field: Parent Informed (boolean)
│   │   └── Subsection: Follow-Up Plan
│   │       ├── Field: Plan Description (text_long)
│   │       ├── Field: Review Date (date)
│   │       ├── Field: Responsible Staff (text_short)
│   │       └── Field: Status (dropdown_single)
│   └── Section: Incident/Injury Reports
│       ├── Subsection: Incident Details
│       │   ├── Field: Incident Date/Time (date)
│       │   ├── Field: Location (text_short)
│       │   ├── Field: Description (text_long)
│       │   ├── Field: Witnesses (text_long)
│       │   ├── Field: Injury Type (text_short)
│       │   └── Field: Severity (dropdown_single)
│       ├── Subsection: Response
│       │   ├── Field: First Aid Given (text_long)
│       │   ├── Field: Administered By (text_short)
│       │   ├── Field: Hospital Referral (boolean)
│       │   └── Field: Photos (file)
│       └── Subsection: Notification & Follow-Up
│           ├── Field: Guardian Notified (boolean)
│           ├── Field: Incident Report (file)
│           ├── Field: Leadership Notified (boolean)
│           └── Field: Corrective Action (text_long)
├── Module: Discipline
│   ├── Section: Incident Log
│   │   └── (References discipline_incidents table)
│   ├── Section: Action Taken
│   │   ├── Field: Action Type (dropdown_single)
│   │   ├── Field: Action Date (date)
│   │   ├── Field: Duration (text_short)
│   │   └── Field: Authorized By (text_short)
│   ├── Section: Resolution
│   │   ├── Field: Resolution Status (dropdown_single)
│   │   ├── Field: Resolution Date (date)
│   │   ├── Field: Follow-Up Notes (text_long)
│   │   └── Field: Parent Acknowledged (boolean)
│   └── Section: Behavior Trends
│       ├── Field: Cumulative Incident Count (number)
│       ├── Field: Positive Behavior Log (text_long)
│       └── Field: Pattern Flags (text_long)
├── Module: Finance
│   ├── Section: Fee Structure
│   │   └── (References fee_structures table)
│   ├── Section: Payment History
│   │   └── (References fee_payments table)
│   ├── Section: Balance Summary
│   │   ├── Field: Current Balance (number)
│   │   ├── Field: Overdue Amount (number)
│   │   ├── Field: Overdue Since (date)
│   │   └── Field: Payment Plan Status (dropdown_single)
│   └── Section: Scholarships/Bursaries
│       ├── Field: Sponsor Name (text_short)
│       ├── Field: Coverage Type (dropdown_single)
│       ├── Field: Coverage Amount (number)
│       ├── Field: Renewal Status (dropdown_single)
│       └── Field: Conditions (text_long)
├── Module: Promotion/Progression
│   ├── Section: Promotion History
│   │   └── (References promotion_history table)
│   ├── Section: Transfers
│   │   ├── Field: Transfer-In School (text_short)
│   │   ├── Field: Transfer-In Date (date)
│   │   ├── Field: Transfer-In Reason (text_long)
│   │   ├── Field: Transfer-Out School (text_short)
│   │   ├── Field: Transfer-Out Date (date)
│   │   └── Field: Transfer Letter Issued (boolean)
│   └── Section: Graduation
│       ├── Field: Graduation Date (date)
│       ├── Field: Certificate Issued (boolean)
│       └── Field: Final Record Snapshot (file)
├── Module: Documents
│   ├── Section: Official Documents
│   │   ├── Field: Birth Certificate (file)
│   │   ├── Field: National ID/Passport (file)
│   │   ├── Field: Transfer Letters (file)
│   │   └── Field: Medical Certificates (file)
│   └── Section: Generated Documents
│       ├── Field: Report Cards (file)
│       └── Field: Certificates (file)
├── Module: Communication
│   ├── Section: Notices Sent
│   │   ├── Field: Notice Title (text_short)
│   │   ├── Field: Date Sent (date)
│   │   ├── Field: Channel (dropdown_single)
│   │   ├── Field: Recipients (text_long)
│   │   └── Field: Delivery Status (dropdown_single)
│   ├── Section: Message History
│   │   └── (References notifications table)
│   └── Section: Meeting Log
│       └── (References parent_meetings table)
├── Module: Extracurricular
│   ├── Section: Clubs/Societies
│   │   └── (References extracurricular_activities + student_activities)
│   ├── Section: Sports
│   │   ├── Field: Sport (text_short)
│   │   ├── Field: Team (text_short)
│   │   ├── Field: Position (text_short)
│   │   └── Field: Achievements (text_long)
│   └── Section: Talent/Arts
│       ├── Field: Activity Type (text_short)
│       ├── Field: Participation Level (dropdown_single)
│       └── Field: Competitions Entered (text_long)
├── Module: Boarding (optional)
│   ├── Section: Accommodation
│   │   ├── Field: Dorm/House Name (text_short)
│   │   ├── Field: Room Number (text_short)
│   │   ├── Field: Bed Number (text_short)
│   │   └── Field: Matron/Patron Assigned (text_short)
│   ├── Section: Welfare Checks
│   │   ├── Field: Check Date (date)
│   │   ├── Field: Checked By (text_short)
│   │   ├── Field: Welfare Status (text_long)
│   │   └── Field: Concerns Flagged (text_long)
│   └── Section: Leave/Exeat
│       ├── Field: Leave Request Date (date)
│       ├── Field: Reason (text_long)
│       ├── Field: Destination (text_short)
│       ├── Field: Pickup Person (text_short)
│       ├── Field: Return Date (date)
│       └── Field: Actual Return Confirmed (boolean)
├── Module: Transport (optional)
│   └── (References transport_routes, route_logs, vehicle_maintenance)
└── Module: Feeding/Catering (optional)
    ├── Section: Meal Plan
    │   ├── Field: Plan Type (dropdown_single)
    │   ├── Field: Dietary Restriction (text_long)
    │   └── Field: Allergy Cross-Reference (text_short)
    └── Section: Payment Status
        ├── Field: Balance (number)
        └── (References fee_payments table)
```

**Note:** The same expansion pattern applies to the Teaching Staff, Non-Teaching Staff, Administrative Staff, and Leadership buckets (staff bio data, contracts/HR, duty rosters, payroll, appraisals, admin docs, board minutes, compliance, etc.) — built from the same field-type toolkit.

**Acceptance criteria:**
- New school onboarding populates the full module/section/field tree automatically.
- System structures are immutable by default but copyable to custom; school-created ones are fully editable (doc 18 Part A).

### 1.3 Brand-Theme Consistency (sign-up → onboarding → dashboard)

**Problem (verified):** Sign-in/sign-up use `from-[#0ea5e9] via-[#0284c7] to-[#f97316]` with animated blobs `#38bdf8/#fb923c/#f43f5e/#fbbf24` (split-screen, equal columns). Onboarding uses `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900` + `AnimatedGradient ["#3b82f6","#8b5cf6","#06b6d4","#10b981"]` (blue/violet/cyan/**green**) — the "all blue, no orange/red" mismatch. The onboarding `AnimatedGradient` component (`src/components/ui/animated-gradient.tsx`) takes a `colors` prop, so the fix is mostly color + layout.

**Changes Required:**

| File | Change |
|------|--------|
| `src/components/onboarding-layout.tsx` | Replace slate palette + blue/violet/cyan/green blobs with the auth palette (`#0ea5e9/#0284c7/#f97316`, blobs `#38bdf8/#fb923c/#f43f5e/#fbbf24`); equalize left/right panel widths (`lg:w-1/2` or a true `lg:grid-cols-2`, not `lg:w-1/3 xl:w-2/5`) |
| `src/app/onboarding/page.tsx` | Align step headers, active-step indicators, and primary buttons with the primary/secondary (blue→orange) tokens |
| `src/app/sign-in/[...sign-in]/sign-in-client.tsx` | Extract shared brand panel tokens (reference for consistency) |
| `src/components/school-theme-provider.tsx` | Ensure brand tokens are applied on auth + onboarding too (not just dashboard) |

**Acceptance criteria:**
- Onboarding visually reads as the same product as sign-in/sign-up: same gradient direction, same orange/red accents, same blob palette.
- Left/right panels are balanced.

### 1.4 Remove All "Skip" / Escape Hatches in Onboarding

**Problem (verified):** Onboarding has "Import students later" and a skipable setup-route path in `src/app/onboarding/page.tsx`.

**Changes:**

| File | Change |
|------|--------|
| `src/app/onboarding/page.tsx` | Remove every "Skip" / "Import students later" / "skip for now" button; make each step either advance or go back explicitly |
| `convex/onboarding.ts` | Add `markStepComplete` gating — next step only unlocks after current step is validated |

**Acceptance criteria:**
- Grep for `Skip|later|for now` in `src/app/onboarding/` finds nothing (except the back navigation).

### 1.5 School Name + Live Time + Time-Based Greeting (visible to all roles)

**Problem (verified):** `SidebarClock` in `src/components/dashboard-layout.tsx` shows time+date only in the collapsible sidebar; the school name lives in the sidebar too. There's no time-based greeting, and nothing role-independent is guaranteed visible.

**Changes Required:**

| File | Change |
|------|--------|
| `src/components/school-greeting.tsx` | **Create** — greeting by hour (5–11 "Good morning", 12–16 "Good afternoon", 17–21 "Good evening", else "Good night"), customisable per school; rendered with school name |
| `src/components/dashboard-layout.tsx` | Add `SchoolGreeting` + live clock to the **top header bar** (visible regardless of role); keep/trim `SidebarClock` |

**Acceptance criteria:**
- Every role sees school name + time + greeting in the top bar.
- Greeting switches correctly at the hour boundaries.

---

## Phase 2: Onboarding Depth (Priority: High)

### 2.1 Multi-File Upload with Sequential Processing

**Problem (verified):** `src/components/import-studio.tsx` uses a single `<Input type="file">`; onboarding steps also accept one file at a time. No queue, no per-file progress.

**Changes Required:**

| File | Change |
|------|--------|
| `src/components/import-studio.tsx` | Accept `multiple`; build a file queue UI (each file: pending → processing → done/error), process **sequentially** — parse, validate, import, then start the next |
| `src/app/onboarding/page.tsx` | Multi-file input on student/staff import steps; per-file progress cards |
| `convex/imports.ts` | Add `importBatch` action that iterates files one at a time; per-file status + partial-failure reporting; keep the 500-row cap per file |
| `src/components/ui/brand-loader.tsx` | Reuse `variant="book"` for the "processing file N of M" state |

**Acceptance criteria:**
- User selects 5 files → they are imported one at a time, each with its own status.
- A failure in file 3 does not abort files 1–2 (already done) or block 4–5 (still runs).

### 2.2 Smart Duplicate Detection & Document Matching

**Problem (verified):** `imports.ts` only skips on duplicate admission number. No document-level matching, no "this document is already applied", no wrong-section detection.

**Changes Required:**

| File | Change |
|------|--------|
| `convex/imports.ts` | Add a `detectDuplicates` step that matches parsed rows against existing students/staff on multiple keys (admNo, nationalId, email, phone, full name + DOB); classify each row `new | duplicate | conflicting` |
| `convex/ocr.ts` + `src/components/document-scanner.tsx` | Add "match against existing records" scan for document uploads (birth certificates, IDs) — flag "This document is already applied to <student>" |
| `src/app/onboarding/page.tsx` + `import-studio.tsx` | Wrong-section detection: compare file column headers against the FIELDS aliases of the current import type; if the best match is a different section, warn "These columns look like Students — apply there instead?" |
| `src/components/import-studio.tsx` | Per-row duplicate UI: skip / overwrite / link-to-existing |

**Acceptance criteria:**
- Re-uploading the same roster flags every row as "already applied" with the matched student.
- Uploading a students file into the teachers step triggers a wrong-section warning.
- No data is overwritten without explicit user confirmation.

### 2.3 Post-Onboarding Two-Part Dismissible Guided Tour

**Problem (verified):** `src/components/welcome-tour.tsx` is a 4-step generic tour keyed on localStorage `schoolmng_welcome_tour_seen`; `dashboard-layout.tsx` also has an `OnboardingTour` popover keyed on `members.hasSeenTour`. Neither is the requested two-part module tour.

**Changes Required:**

| File | Change |
|------|--------|
| `src/components/guided-tour.tsx` | **Create** — full tour engine: spotlight tooltips over real DOM targets, prev/next, progress dots, and an **X button that stops the entire tour** (marks fully dismissed) |
| `src/components/guided-tour.tsx` | Part 1: school/modules showcase — walk the sidebar groups (Academics, Assessments, Library, Learner, Teaching, Admin, Leadership, Community, Operations, Tools) |
| `src/components/guided-tour.tsx` | Part 2: per-module feature walkthrough — one step per module with its feature list |
| `src/components/dashboard-layout.tsx` | Replace `OnboardingTour` popover with the guided tour; fire after onboarding completes |
| `src/app/dashboard/page.tsx` | Tour entry point + "Start tour" button in settings |

**Acceptance criteria:**
- Tour runs in two parts after onboarding.
- Clicking X dismisses the whole tour permanently (both parts), even mid-part-2.
- Tour can be manually restarted from Settings.

---

## Phase 3: AI Assistant UX (Priority: High)

### 3.1 Themed Assistant Button — Collapsed by Default, Smooth Expand/Collapse

**Problem (verified):** `src/components/ai-chat.tsx` opens/closes with a bare `isOpen` boolean (abrupt), rendered as a blue circle with `Bot`/`Sparkles` icons.

**Changes Required:**

| File | Change |
|------|--------|
| `src/components/ai-chat.tsx` | FAB becomes a **themed button** (brand gradient border/glow, assistant/message icon) collapsed by default; expand/collapse uses height+opacity+translate with ~250–300ms ease (and `prefers-reduced-motion` guard) |
| `src/components/ai-chat.tsx` | Loading state uses `BrandLoader variant="dots"` |
| `src/components/dashboard-layout.tsx` | Keep `<AiChat />` mount, verify the FAB is styled per brand, not a hard blue circle |

**Acceptance criteria:**
- Assistant is a small themed button until clicked; opens with a smooth animation; closes smoothly.
- No abrupt show/hide.

---

## Phase 4: Schema Expansion (Priority: High)

### 4.1 New Tables

| Table | Purpose |
|-------|---------|
| `student_medical_allergies` | Repeatable allergy records |
| `student_medical_conditions` | Repeatable chronic conditions |
| `student_medications` | Repeatable medication records |
| `student_immunizations` | Repeatable immunization records |
| `student_screenings` | Vision, hearing, dental screenings |
| `student_growth_logs` | Height/weight tracking with auto BMI |
| `student_counseling_sessions` | Counseling session records (sensitive) |
| `student_incidents` | Injury/incident reports |
| `scholarships` | Scholarship/bursary records |
| `period_attendance` | Period-level attendance |
| `absence_logs` | Detailed absence records |
| `student_report_cards` | Generated report cards |
| `boarding_records`, `boarding_welfare_checks`, `boarding_leave_requests` | Boarding module |
| `feeding_plans` | Meal plans |
| `transfer_records`, `graduation_records` | Progression |
| `import_runs`, `import_row_results` | Import audit trail (for 2.2) |
| `tour_states` | Guided-tour state per member (for 2.3) |

### 4.2 Modify Existing Tables

| Table | Additions |
|-------|-----------|
| `schools` | `leadershipTitle` |
| `roles` | `key` (stable), allow-rename for defaults |
| `students` | `nationalId`, `county`, `nationality`, `religion`, `bloodGroup`, `preferredName`, `placeOfBirth` |
| `health_records` | Expand to full medical profile |
| `clinic_visits` | `vitalSigns`, `diagnosis`, `outcome` |
| `discipline_incidents` | `resolutionDate`, `followUpNotes`, `parentAcknowledged` |
| `fee_structures` | `feeCategory`, `discounts`, `scholarships` |
| `books` | `condition`, `category`, `location`, `acquisitionDate` |
| `sections` | `parentId` (recursive nesting) |
| `modules`/`sections`/`fields` | `isSystem` marker |

---

## Phase 5: Backend Functions (Priority: High)

### 5.1 New CRUD Modules

| File | Functions |
|------|-----------|
| `convex/studentMedical.ts` | CRUD for allergies, conditions, medications, immunizations |
| `convex/studentScreenings.ts` | CRUD for vision/hearing/dental screenings |
| `convex/studentGrowth.ts` | CRUD growth logs + BMI auto-calc |
| `convex/studentCounseling.ts` | CRUD sessions (sensitive-flagged) |
| `convex/studentIncidents.ts` | CRUD injury/incident reports |
| `convex/scholarships.ts` | CRUD scholarships/bursaries |
| `convex/periodAttendance.ts` | CRUD period attendance |
| `convex/absenceLogs.ts` | CRUD absence records |
| `convex/reportCards.ts` | CRUD report cards |
| `convex/boarding.ts` | CRUD boarding, welfare checks, leave/exeat |
| `convex/feeding.ts` | CRUD meal plans |
| `convex/transfers.ts` | CRUD transfers |
| `convex/graduation.ts` | CRUD graduations |
| `convex/importRuns.ts` | CRUD import runs + row results |
| `convex/tours.ts` | Tour-state read/write per member |

### 5.2 Permission-Aware Queries (every query gates before returning data)

```ts
export const listStudentMedical = query({
  args: { schoolId: v.id("schools"), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const roleId = await getRoleId(ctx, args.schoolId);
    await requireViewAccess(ctx, roleId, "section", "medical_profile_id");
    // … fetch and return
  },
});
```

### 5.3 Calculation Engine Primitives (`convex/calcEngine.ts`)

Filter, group, sum, average, count, min/max, rank, percentage, trend. BMI, fee balances, attendance %, and class ranks are **computed server-side** and returned read-only (anti-manipulation per architecture doc).

### 5.4 Backend-Rendered Data Hardening (anti-manipulation)

| Area | Change |
|------|--------|
| Finance | Totals/balances computed in Convex (`fees.ts`, `expenditures.ts`), never summed client-side; writes validated server-side with audit entries |
| Billing | `paystack.ts` + `subscriptions.ts` remain the source of truth; UI only renders server data |
| Generic EAV | `records.ts`/`fieldValues.ts` accept only validated `inputType`s; `requireEditAccess` enforced on every write |
| Reports | `reports.ts`/`comprehensiveReports.ts` compute server-side; PDFs via `pdfGenerator.ts` |

**Acceptance criteria:**
- A tampered client payload (e.g. forged totals) is rejected or recomputed server-side.
- Every write mutation logs an audit entry (already the pattern via `logAuditEntry`).

---

## Phase 6: Frontend Components (Priority: Medium)

### 6.1 Generic EAV Renderer Completion

`src/components/generic/` already has `ModuleRenderer`, `SectionRenderer`, `FieldRenderer`, `RecordList`, `RecordDetail`, `PermissionGate` — complete + wire them:

| Component | Work |
|-----------|------|
| `FieldRenderer.tsx` | Support every `inputType` incl. `file`, `dropdown_multi`, `boolean`; render read-only/view/edit states per permission |
| `SectionRenderer.tsx` | Recursive subsections via `parentId` |
| `RepeatableGroup.tsx` | **Create** — repeatable sub-records (allergies, medications, growth logs) |
| `ModuleRenderer.tsx` | Compose section tree for any module; honor `isEnabled` |

### 6.2 Module-Specific Pages

| Page | Components |
|------|------------|
| `/dashboard/students/[id]` | Tabbed 360° view: Bio, Academics, Health, Library, Finance, Discipline, Documents |
| `/dashboard/health` | Full medical profile with repeatable groups |
| `/dashboard/counseling` | Session log with sensitive-field protection |
| `/dashboard/boarding`, `/dashboard/feeding` | Full modules |

### 6.3 Settings Pages (doc 18 — Module/Section/Field Builder + Roles/Permissions)

**Problem (verified):** `/dashboard/settings` is branding-only; `/dashboard/permissions` is a bare module-level assigner. Doc 18's Settings → Structure builder and deep role/permission manager don't exist.

| Page | Purpose |
|------|---------|
| `/dashboard/settings/structure` | Module/Section/Field tree editor (toggle, add, edit, delete) — drives `modules.ts`/`sections.ts`/`fields.ts` CRUD |
| `/dashboard/settings/roles` | Role list, rename (incl. leadership title via 1.1), create, delete; bucket assignment |
| `/dashboard/settings/permissions` | Field-level permission assignment using `resolveEffectiveAccess`; tree view module → section → field with view/edit/none |

### 6.4 Centered Content (settings, billing, and siblings)

**Problem (verified):** `/dashboard/settings` is `max-w-2xl` left-aligned; `/dashboard/billing` content is left-aligned too.

| File | Change |
|------|--------|
| `src/app/dashboard/settings/page.tsx` | Center the page: `mx-auto max-w-3xl` + centered headings/cards (keep delete-zone clearly separated) |
| `src/app/dashboard/billing/page.tsx` | Center subscription cards / trial progress / price tiers |
| Other dashboard pages | Apply the same centered container pattern for consistency |

---

## Phase 7: UI/UX Improvements (Priority: Medium)

### 7.1 Student Profile 360° View
Tabbed interface across all modules, real-time EAV data, permission-based visibility, PDF export.

### 7.2 Dashboard Enhancement
Show only enabled modules; dynamic nav from school config; quick stats per module; recent activity feed.

### 7.3 Mobile Responsiveness
All new components mobile-ready; touch-friendly controls; responsive tables/forms.

---

## Phase 8: Testing & Validation (Priority: High)

### 8.1 Type Checking
```bash
npx tsc --noEmit
```

### 8.2 Convex Deployment
```bash
npx convex dev --once
```

### 8.3 Manual Test Cases

| Test Case | Expected Result |
|-----------|-----------------|
| Navigate across auth/onboarding/dashboard | Fade-in transitions, no hard cuts |
| Load site / any route / press any loading button | Custom brand loader, never the generic circle |
| Create school with custom leadership title | Title appears in UI and is used for permission checks |
| Onboarding seeds EAV data | Full module/section/field tree populated |
| Upload 5 files to import | Processed sequentially, per-file status, failures isolated |
| Re-upload same roster | All rows flagged "already applied" with matched student |
| Upload students file to teachers step | Wrong-section warning |
| Finish onboarding | Two-part guided tour starts; X stops the entire tour |
| Rename "Principal" → "Headteacher" | UI updates; permission gates unchanged |
| Student profile | All tabs render per enabled state + permissions |
| Sensitive fields (counseling) | Only authorized roles can view |
| Settings/billing pages | Centered, not stuck left |
| Disable a module in Settings → Structure | It disappears from nav + student profile |

### 8.4 Performance Testing
- 1000+ students; pagination verified; query response times; index usage validated.

---

## Implementation Order & Effort

| Phase | Duration | Priority | Dependencies |
|-------|----------|----------|--------------|
| **0.1 Page transitions** | 1–2h | Critical | None |
| **0.2 Brand loader** | 3–4h | Critical | None |
| **1.1 Flexible leadership naming** | 3–4h | Critical | 0.2 |
| **1.2 EAV seeding** | 4–6h | Critical | 1.1 |
| **1.3 Theme consistency** | 2–3h | Critical | 0.1, 0.2 |
| **1.4 Remove skips** | 1h | Critical | 1.3 |
| **1.5 Greeting + clock** | 1–2h | High | 0.2 |
| **2.1 Multi-file upload** | 4–6h | High | 0.2 |
| **2.2 Duplicate detection** | 5–8h | High | 2.1 |
| **2.3 Guided tour** | 4–6h | High | 0.2 |
| **3.1 AI chat FAB** | 2–3h | High | 0.2 |
| **4.1 Schema tables** | 4–6h | High | 1.2 |
| **4.2 Modify tables** | 2–3h | High | 4.1 |
| **5.1 New CRUD** | 8–10h | High | 4 |
| **5.2 Permission-aware queries** | 4–6h | High | 5.1, 1.1 |
| **5.3 Calc engine** | 4–6h | Medium | 5.1 |
| **5.4 Backend hardening** | 4–6h | High | 5.1 |
| **6.1 EAV renderers** | 6–8h | Medium | 5 |
| **6.2 Module pages** | 8–10h | Medium | 6.1 |
| **6.3 Settings pages** | 6–8h | Medium | 6.1, 1.1 |
| **6.4 Centered layouts** | 1–2h | Medium | 0.1 |
| **7.1–7.3 UI polish** | 6–8h | Medium | 6 |
| **8 Testing/validation** | 4–6h | High | All |

**Total: ~90–120 hours.**

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Renaming roles breaks auth | Stable `key` vs editable `name` decoupling; key-based checks; migration tests |
| Schema migration breaks data | Convex migrations on dev first; seed is deterministic/idempotent |
| Transitions/loader feel heavy | 250–300ms eases, `prefers-reduced-motion` guard, reuse one animation library surface |
| Import runs get slow | Sequential queue with per-file progress; keep 500-row cap; consider action-based batching |
| Duplicate detection false positives | Match on multiple keys with confidence scores; always require user confirmation to link/overwrite |
| Performance with deep EAV trees | Pagination, lazy rendering, index per `schoolId`+bucket keys |

---

## Success Criteria

- [x] No hard cuts when moving between any pages — fade-in everywhere (Phase 0.1)
- [x] Generic spinner circle is gone — custom brand loader everywhere (Phase 0.2)
- [ ] All 5 buckets have full enterprise-grade depth per doc 17
- [x] Schools can rename their leadership role and see the new title everywhere (Phase 1.1 — stable key + editable display name, roles table, onboarding capture, frontend uses roleNameById)
- [x] EAV seed data populates on school creation; Settings → Structure can edit it (Phase 1.2 — seedFullTree.ts seeds all 5 buckets, wired into onboarding)
- [ ] Multi-file sequential import with per-file status
- [ ] Duplicate/wrong-section detection with confirmation
- [ ] Two-part dismissible guided tour after onboarding
- [x] AI assistant: themed, collapsed-by-default, smooth open/close (Phase 3.1 — BrandLoader dots, transition-all 300ms, scale/opacity/translate animation)
- [x] Greeting + school name + clock visible to all roles (Phase 1.5 — SchoolGreeting + HeaderClock in dashboard header)
- [x] Settings/billing content centered (Phase 6.4 — max-w + mx-auto)
- [x] Permission system works at field level (Phase 5.2 — requireViewAccess/requireEditAccess sweep on fieldValues, requirePrincipal on modules/sections/fields)
- [x] Enterprise analytics on dashboard + dedicated analytics page with date-range/term filters (Phase 9.1–9.4)
- [x] Role invitation + access lifecycle: invite by email → Clerk email → accept → head notified, suspend/reactivate/revoke with messages (Phase bonus)
- [ ] All tests pass; no TypeScript errors; 1000+ students performs acceptably

---

*Author: Buffy (AI Assistant) — canonical implementation plan for SchoolMNG*


addition 



# Fix prompt for the coding agent — onboarding/mapping bugs

The following four bugs exist in the current running implementation and must be fixed. These are not new features — they are the system not following the spec that already exists across `00`, `09`, `10`, `17`, `18`, and the four AI tool definitions (`universal_document_router`, `live_permission_scoped_data_lookup`, `permission_scoped_navigation`, `onboarding_population_and_labeling`).

## Bug 1: Manual entry is being ignored in favor of uploaded documents

**Symptom:** When a school manually types data during onboarding or afterward (e.g. entering school fees and fee terms directly into a form), that data does not show up in the dashboard/fees record. The system appears to only be reading uploaded PDF files, and disregarding anything typed manually — even when both were provided.

**Root cause to check:** the import/onboarding pipeline is very likely treating file upload as the primary/only data source and manual entry as secondary or discarded, instead of treating both as equal, combined input to the same classification step.

**Required fix:** every onboarding and data-entry pathway must run manual answers and uploaded documents through the **same classification logic** (`universal_document_router`, called once per record regardless of source), with no source given priority over the other. If a school types "Term 1 school fees: 15,000 KES" manually AND uploads a fee statement PDF, both must be captured — the manually typed value must never be silently overwritten, ignored, or excluded just because a file was also uploaded. Test explicitly: manual-only entry with zero file upload must still populate the dashboard correctly. This is currently failing and must pass before this bug is considered fixed.

## Bug 2: Naming convention hardcoded to internal defaults instead of the school's own terms

**Symptom:** Every school sees hardcoded internal labels (e.g. "Principal" is shown even when a school onboarded and referred to that role by a different term; "Learners" is shown even though the school calls them "Students" or another term in their own documents/answers).

**Root cause to check:** the frontend is very likely rendering the internal schema key (`principal`, `learners`) directly as the display label, instead of rendering a per-school `displayLabel` that should have been captured during onboarding.

**Required fix:**
- The internal schema key must never change and must never be shown to the user directly — it exists purely for schema/permission/AI-tool referencing.
- A `displayLabel` field, per school, per bucket/role/module node, must be captured during onboarding by `onboarding_population_and_labeling` — pulled from whatever term the school actually used, either typed manually or found in an uploaded document (e.g. if a job title on an uploaded staff list says "Head Teacher," capture that verbatim as the label for that school, don't force it to the internal default).
- If a school never provides their own term for a given node, fall back to a sensible generic default label — but never silently substitute an internal key name that was never meant to be user-facing.
- Every screen in the app must render `displayLabel`, never the internal key, for anything shown to school staff.
- This must be editable afterward via Settings → Structure (`18-settings-module-builder-and-permissions.md`, Part A, Edit Node) — confirm this edit path actually persists to the same `displayLabel` field the onboarding tool writes to, not a separate/disconnected field.

## Bug 3: Every school gets the same dashboard regardless of what they actually use

**Symptom:** Two schools that provided completely different onboarding data end up seeing an identical dashboard — modules that were never enabled for a given school are still showing up.

**Root cause to check:** the dashboard is very likely rendering from a hardcoded "show everything" list instead of querying per-school module-enablement metadata.

**Required fix:**
- `onboarding_population_and_labeling` must write an explicit per-school enablement record (on/off, per module/section, down to field level where relevant) based only on what was actually provided (manual or uploaded) — never defaulting a module to "on" just because it exists in the base tree (`17-full-depth-module-template.md`).
- The dashboard, and every other screen, must query this per-school enablement metadata on load and render only what's enabled for that specific `schoolId` — no hardcoded universal module list anywhere in the frontend.
- Confirm this respects the existing Settings → Structure toggle behavior (`18`, Part A) — a module a school turns off manually must behave identically to a module that was never enabled during onboarding: hidden, not deleted, data preserved if any exists.
- Test explicitly with two schools that provided different data at onboarding and confirm their dashboards differ accordingly — this is currently failing (both show the same dashboard) and must pass before this bug is considered fixed.

## Bug 4: Onboarding is not reading everything before mapping

**Symptom:** Related to Bug 1 — school fee terms typed manually do not appear correctly, described by the school as onboarding "not doing correct terms" and only reading the PDF. More broadly, the onboarding classification step appears to be running on a partial view of the inputs rather than the complete combined set of everything the school provided.

**Required fix:** before any module-enablement or field-population decision is made, `onboarding_population_and_labeling` must have ingested the **complete** set of onboarding inputs — every manual answer across every onboarding step, and every uploaded document of every file type — not a subset, and not just whichever input arrived first or was easiest to parse. No classification or population decision should be made until the full combined input set for that onboarding session has been assembled. This is the same fix as Bug 1, applied at the pipeline-sequencing level rather than the source-priority level — both must be corrected together, since fixing one without the other will leave partial/inconsistent onboarding results.

## Acceptance criteria (all four must pass together, not independently)

1. A school that provides fee/term data manually only (no file upload) sees that data correctly in their dashboard.
2. A school that provides the same data only via uploaded document sees it correctly too, with no behavioral difference from (1) other than the source.
3. A school that provides some data manually and some via upload sees both combined correctly, with neither source overwriting or excluding the other.
4. Role/bucket/module names shown to a school reflect that school's own terminology (from onboarding input), not internal schema keys, and this is editable later in Settings without breaking the underlying internal references.
5. Two schools with different onboarding inputs have visibly different dashboards, each showing only what was enabled for them specifically — never a shared universal default view.

---

## Phase 9: Enterprise Analytics & Visualization (Priority: High)

**Problem (verified):** the dashboard is functional but basic — a stat grid, two charts, a progress bar. No fee-collection trends, no school/class performance view, no attendance trends, and no analytics on module pages. **Additionally, the analytics backend is unsafe to build on:** `dashboardStats.getDashboardStats` and `comprehensiveReports.*` have zero auth gates (any logged-in user can read any school's data) — these must be gated as part of this phase.

### 9.1 Analytics Backend (auth-gated)

| File | Change |
|------|--------|
| `convex/analytics.ts` | **Create** — industry-standard analytics queries, ALL gated (`requireSchoolMembership` for academic/attendance; `requirePrincipal` for finance): `getFeeAnalytics` (collection trend over last 12 weeks, expected vs collected vs outstanding, collection rate, per-class collection, by-method split, top debtors), `getAcademicAnalytics` (exam mean-score trend, per-class performance, per-subject performance, top students), `getAttendanceAnalytics` (14-day rate trend, per-class rate, today's breakdown) |
| `convex/analytics.ts` | `getDashboardAnalytics` — one bundled, role-aware query for the dashboard (finance section omitted server-side for non-leadership) |
| `convex/dashboardStats.ts` | Add `requireSchoolMembership` gate (P0 fix — currently zero auth) |
| `convex/comprehensiveReports.ts` | Add auth gates to `getSchoolOverview` / `getTermComparison` / `getClassPerformance` (P0 fix) |

### 9.2 Chart Component Library (industry standard)

| File | Change |
|------|--------|
| `src/components/charts.tsx` | Add `HorizontalBarChart`, `RadialProgress` (SVG ring with center label), `Sparkline`, `ChartCard` (title/subtitle/actions/height/empty-state wrapper), `EmptyChart`; theme datasets with school primary/secondary colors |

### 9.3 Dashboard Overhaul (industry standard)

| File | Change |
|------|--------|
| `src/app/dashboard/page.tsx` | Rebuild: KPI row with trend deltas, **fee collection area/line chart** (collected vs expected, 12 weeks), **collection-rate ring + by-method doughnut**, **per-class collection bars**, top-debtors list (leadership), **school exam performance trend line**, **per-class performance bars**, top-students list, **attendance rate trend** + per-class attendance, existing library/class charts, alerts & quick actions |

### 9.4 Analytics on Module Pages

| Page | Visuals |
|------|---------|
| `/dashboard/fees` | Collection trend, per-class collection bars, by-method doughnut, top debtors |
| `/dashboard/reports` | Fix auth gates, add term-comparison + class-performance charts |
| `/dashboard/attendance` | 14-day rate trend, per-class rate bars |
| `/dashboard/exams` | Mean-score trend, per-class performance, top performers |
| `/dashboard/students` | Class distribution, gender split |

**Acceptance criteria:**
- A principal sees fee trends, collection rate, per-class performance, exam trends and attendance trends on the dashboard; a teacher sees academic/attendance but NO finance figures.
- Every analytics query returns 403-style errors for users outside the school; finance queries fail for non-leadership.
- Charts render on the dashboard and the module pages above, with sensible empty states.

















I also noticed that when fees are paid its ok but a senario where the student paid more than the expected it doesnt say that the school owes them  which is a bug. fix other bug also miscalculation that they might encounter from thier day to day activity and also remove the aesteric that the ai agent put when messaging let be maybe a different colour  but no aesterics. and also give permission to the head because they see everything they must not be retricted to ask anything so long its related to their school alone. also remove this annoyance of when i click a certain nav or sub section it take me to that place but the nav section it return me to the top so i get the tassle and tiresome job to look where i was again 

