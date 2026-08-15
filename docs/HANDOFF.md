# Handoff — Import Pipeline, Smart Document Classification & Path to Release

**Branch:** `stable-v0.2.0` (last commit `456be62` — v0.2.1)
**Date:** 2026-08-11
**Status:** Import pipeline + smart file classifier **done and verified** (typecheck 0 errors, Convex push OK). **In-flight, not started:** document persistence (saving recognized PDF/DOCX files so dashboard pages are no longer empty) and the browser PDF text-extraction fix.

---

## 1. The Goal

Per `docs/IMPLEMENTATION-PLAN.md`: bring SchoolMNG to **enterprise-grade** — a school management system that replaces spreadsheets, paper records, and third-party tools for every school function. The plan is organised into Phases 0–9 (see that doc for the full detail):

| Phase | Focus | Status (as of this handoff) |
|---|---|---|
| 0 | Global UX foundations — page transitions + brand loader | **Done** — `src/app/template.tsx`, `src/components/page-transition.tsx`, `src/components/ui/brand-loader.tsx`, root/dashboard `loading.tsx` all exist |
| 1 | Foundation fixes (leadership roles, multi-term, EAV, permissions) | Partial — see plan; roles/schema groundwork exists |
| 2 | Onboarding depth | Substantially advanced (see §2, §3 below) |
| 3 | AI Assistant UX | Partial — `convex/aiAssistant.ts` exists and powers `suggestImportMapping` |
| 4 | Schema expansion | Many tables exist in `convex/schema.ts` (students, classes, fees, attendance, exams, `student_documents`, `compliance_documents`, …) |
| 5–9 | Backend functions, frontend components, UX polish, testing, analytics | Ongoing — see plan for the itemized lists |

The plan's own self-assessment was **~40% complete**. The recent work below advances Phases 2/3 and the "upload your real school files" experience.

---

## 2. What's Done (this workstream)

### 2.1 Smart file classifier — `src/lib/file-classifier.ts` (untracked in git — must be added)

Replaces blind "sniff columns → students" routing with a scored classifier (`classifyDocumentFile(headers, rows, fileName, text)`). Recognizes **12 kinds**:

- Tabular: `students`, `staff`, `fees` (structures), `fee-payments`, `subjects`, `classes`, `terms`, `attendance`, `school-info`, `logs`
- **Prose (PDF/DOCX/image text)**: `school-docs`, plus **`admission-letters`, `report-cards`, `transfer-letters`** (new — recognized by letterhead language like "OFFER OF ADMISSION", "REPORT CARD", "mean grade / class teacher's remarks", "transfer certificate / has been transferred to")
- `unknown` is only returned when there is genuinely nothing to go on

Key mechanics:
- **Disambiguation rules** for the #1 complaint ("student-related file lands in Students"): money columns + name but **no** student identity (adm no / DOB / guardian) → `fee-payments`; class + amount + no names → `fees`; class columns + no names/money → `classes`; subject columns + no staff identity → `subjects`; term/session columns → `terms`.
- **Filename hints** (`filenameHints`) — never for tabular kinds (a `roster.pdf` hint must not become a student import); used for prose kinds only, most-specific-first (`PROSE_HINT_KINDS`).
- **Filename-only fallback**: no text + a filename that names a prose kind (`admission-letter.pdf`, `report-card-term1.pdf`, `transfer-certificate.pdf`, `audit-log.pdf`) → classified low-confidence instead of `unknown`.
- **Ordering constraint (documented in code):** `DOC_TEXT_KEYWORDS` ties are broken by insertion order (stable sort) — specific kinds MUST stay listed before the generic `school-docs` entries.
- `KIND_GUIDES` labels/hrefs drive onboarding badges and ImportStudio hints. **Planned change (§4):** point the doc kinds at `/dashboard/records`.

### 2.2 Bulk import actions — `convex/imports.ts` (untracked in git)

Existing: `importBatch` (students/staff/fees), `importAttendance`, `importStudentsInternal`. **New actions added:**
- `importFeePayments` — resolves students by admission number (or name against existing students), writes `fee_payments` for the active term, **duplicate guard** (re-import of the same file doesn't double-charge), unresolved students reported as errors (never silently dropped).
- `importSubjects`, `importClasses`, `importTerms` — with `insert*Internal` mutations; `importTerms` auto-creates academic years (dedup by label).
- Conventions that must be respected in this file: **internals defined before the actions that call them**; explicit type annotations on action handlers to break `ApiFromModules` circularity (see §5 gotchas).

### 2.3 ImportStudio — `src/components/import-studio.tsx` (untracked in git)

- `FileKind` extended to 9 kinds (students, staff, fees, attendance, fee-payments, subjects, classes, terms, school-docs) with per-kind field catalogs, auto-mapping (name columns reserved first via `autoMapNames` — fixes the old whole-file "Missing student name" bug), row builders, issue builders, and import branches calling the new actions.
- PDF/DOCX prose files become `school-docs` kind with an **extracted-text preview** instead of throwing "could not extract structured data".
- AI "Suggest mapping" button (`analyzeFileWithAI`) — server side in `convex/aiAssistant.ts` `suggestImportMapping` (teaches the model the new kinds).
- `detectFileKind` maps prose kinds (`school-docs`, `school-info`, `admission-letters`, `report-cards`, `transfer-letters`, `logs`) → `school-docs` FileKind.

### 2.4 Onboarding — `src/app/onboarding/page.tsx`

- `parseDocument` now passes extracted text into the classifier, so PDF/DOCX prose gets a kind badge + text preview instead of "Unrecognized".
- Classifier runs on `processed.allHeaders`/`sampleRows`/text (same tool the importer uses).

### 2.5 Verified end-to-end

- **Real student CSV** (`docs/baptist-prep-2026/03-students.csv`, 560 rows): PapaParse 0 errors, classifier → `students` (high, score 13), **17/17 columns auto-mapped** (incl. BOM-prefixed `FirstName`), 0 missing names / 0 missing classes / 0 duplicate admNos / all dates parse. Verified with a script replicating `buildMapping` + `buildStudentRow` + `buildStudentIssues` byte-for-byte.
- **12 classifier prose cases** (admission letter, report card, transfer letter, filename-only variants, policy, prospectus, annual report, adversarial transfer/admission cross-phrases, code of conduct) — all correct.
- Full project `npx tsc --noEmit`: **0 errors**. Convex push (`CONVEX_AGENT_MODE=anonymous npx convex dev --once`): **"Convex functions ready!"**.
- Dev server verified on `http://localhost:3000` (no console errors; `next dev` was already running).

---

## 3. What's Remaining

### 3.1 IN-FLIGHT — Document persistence (designed, NOT started) — do this next

**Problem:** recognized documents (admission letters, report cards, policies, etc.) are classified and previewed but **never saved anywhere**, so the dashboard pages stay empty. ImportStudio's `school-docs` import branch (import-studio.tsx ~line 1477) only increments `schoolDocsRecognized++` and marks the entry done — nothing is stored. Onboarding parses/classifies/upload-links files but never records them.

**Plan (all steps designed and confirmed against the code):**

1. **`convex/schema.ts`** — add a school-scoped documents table (there is `student_documents` which *requires* a `studentId`, and `compliance_documents` which is leadership/compliance-specific — neither fits):
   ```ts
   school_documents: defineTable({
     schoolId: v.id("schools"),
     kind: v.string(),                      // DocKind: school-docs / admission-letters / report-cards / transfer-letters / school-info / logs / students / unknown
     name: v.string(),                      // original file name
     extractedText: v.optional(v.string()),
     fileStorageId: v.optional(v.string()),
     uploadedBy: v.string(),
     uploadedAt: v.float64(),
   }).index("by_schoolId", ["schoolId"])
     .index("by_schoolId_kind", ["schoolId", "kind"]);
   ```

2. **New `convex/schoolDocuments.ts`** — `listBySchool` query (`{schoolId, kind?}` → `by_schoolId`/`by_schoolId_kind`, order desc, take 500), `create` mutation (`{schoolId, kind, name, extractedText?, fileStorageId?}` → `requireSchoolMembership` + `logAuditEntry`), `remove` mutation. Mirror the pattern in `convex/studentDocuments.ts`.

3. **`src/components/import-studio.tsx`** — replace the `school-docs` branch (~line 1477):
   - Add hooks: `useMutation(api.files.generateUploadUrl)` (already exists in `convex/files.ts`) and `useMutation(api.schoolDocuments.create)`; add `useMutation` to the `convex/react` import (currently only `useQuery, useAction`).
   - Upload `entry.file` (FileEntry keeps the `File`) via `generateUploadUrl` + `fetch` (Content-Type = file.type); on failure still save the text-only record.
   - `create({ schoolId, kind: entry.autoKind !== "unknown" ? entry.autoKind : "school-docs", name: entry.fileName, extractedText: entry.docText, fileStorageId })`.
   - Extend `FileImportResult.schoolDocs` (line ~738, currently `{ recognized: 1 }`) to `{ recognized, saved, documentId? }` and report save errors in the report, not silently.

4. **`src/app/onboarding/page.tsx`** — add `file?: File` to `DocQueueItem` (set it in `handleDocFiles`, ~line 355); add `saveSchoolDocument` mutation hook (reuse the existing `generateUploadUrl` hook at line 283); in `finishOnboarding` (~line 620), after `completeOnboarding`, loop over ready docs and upload + `create` each — wrapped in per-doc try/catch so one failure never blocks onboarding.

5. **`src/app/dashboard/records/page.tsx`** — add `useQuery(api.schoolDocuments.listBySchool, school ? { schoolId: school._id } : "skip")`; in the `!moduleId` empty-state branch render a "School documents" list: kind badge via `KIND_GUIDES[doc.kind].label`, file name, upload date, and a truncated extracted-text preview.

6. **`src/lib/file-classifier.ts`** — update `KIND_GUIDES` hrefs so the "Goes to …" promises match where docs actually appear: `school-docs`, `admission-letters`, `report-cards`, `transfer-letters` → `/dashboard/records` (the new documents home). Keep `school-info` → settings, `logs` → settings.

7. **Verify:** `npx convex codegen` → `CONVEX_AGENT_MODE=anonymous npx convex dev --once` → `npx tsc --noEmit` → browser check on `localhost:3000`.

### 3.2 IN-FLIGHT — Browser PDF text extraction (why files get "flagged as none")

**Root cause:** `extractTextFromPDF` in `src/lib/document-processor.ts` (line 363) uses **`pdf-parse` v2, which is Node-only** (requires `Buffer`). In the browser the dynamic import throws, the fallback reads the binary PDF as printable text and returns garbage/empty → no text → classifier returns `unknown` → UI shows "Unrecognized"/none. (DOCX via `mammoth` and images via `tesseract.js` work in the browser.)

**Plan:**
1. `npm i pdfjs-dist@^5.4.296` — already present in `node_modules` as a transitive dep of pdf-parse; promote to a direct dependency.
2. Rewrite `extractTextFromPDF` to use pdfjs-dist in the browser: dynamic `import("pdfjs-dist")`, set `GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()`, `getDocument({ data: new Uint8Array(await file.arrayBuffer()) })`, loop pages with `getTextContent()` joining item strings, `doc.destroy()`. Keep the pdf-parse path only as a Node fallback (guard on `typeof Buffer !== "undefined"`).
3. Re-run the classifier prose tests to confirm PDFs now yield text and kind.

### 3.3 Rest of the implementation plan

Everything itemized in `docs/IMPLEMENTATION-PLAN.md` Phases 1–9 (leadership-role flexibility, onboarding depth, AI assistant UX, schema expansion, backend functions, frontend components, UX polish, testing/validation, enterprise analytics). The plan's own §"Implementation Order & Effort", §"Risk Assessment", §"Success Criteria", and the four onboarding bugs (Manual entry ignored / naming convention hardcoded / same dashboard for everyone / onboarding not reading everything) are the authoritative next-work lists.

---

## 4. Gotchas & Conventions (learned the hard way)

- **Stale Convex generated types** cause phantom `TS7022`/`TS7006` "implicitly has type any … own initializer" errors across `convex/*.ts` (e.g. `imports.ts:1504`, `permissionAgent.ts:156`). **Fix: `npx convex codegen`, then re-typecheck.** This exact error appeared again after a successful push and was cleared by codegen. When adding new actions, run codegen **before** pushing to avoid `ApiFromModules` circularity in `_generated/api.d.ts`.
- **`convex/imports.ts` convention:** internal functions must be defined **before** the actions that reference them via `internal.imports.*`; add explicit type annotations to action handlers that reference other functions in the same module.
- **Classifier field-mapping:** name columns are reserved first (`autoMapNames`) — a generic `fullName` alias stealing `FirstName` is what caused the old whole-file "Missing student name" errors.
- **Files currently UNTRACKED in git (need `git add` when committing):** `convex/imports.ts`, `convex/aiAssistant.ts`, `src/components/import-studio.tsx`, `src/lib/file-classifier.ts` (plus `docs/10-import-ocr-flow.md` if still wanted).
- **`logs` autoKind** is now routed to `school-docs` in `detectFileKind` (a file named `audit-log.pdf` must not surface as a Students import).
- **ROOT `HANDOFF.md`** covers the earlier v0.2.0 member-invitations work (webhooks, Clerk metadata gap) — separate from this doc.

## 5. How to Verify / Commands

```bash
npx convex codegen                          # regenerate client/server types
npx tsc --noEmit                            # full typecheck (target: 0 errors)
CONVEX_AGENT_MODE=anonymous npx convex dev --once   # push + typecheck convex/, prints "Convex functions ready!"
npm run dev                                 # dev server → http://localhost:3000
```

Smoke test: sign in, upload `docs/baptist-prep-2026/03-students.csv` in ImportStudio (expect: Students kind, 17 columns pre-mapped, 0 errors, 560 rows), and upload a PDF admission letter (expect: "Detected as Admission letter", text preview — and once §3.1 lands, it appears on the Records page).
