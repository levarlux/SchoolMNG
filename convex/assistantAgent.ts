/**
 * Data Assistant (flexibility phase 3 — consent-to-execute)
 *
 * Follows the permissionAgent pattern: the assistant NEVER mutates anything
 * itself. Given an uploaded file's headers + sample rows, it classifies the
 * file, suggests the column mapping, and returns a structured `proposal`
 * rendered as a consent card. The client executes the real mutation only
 * after the head clicks Approve, so every write is school-scoped, reviewed,
 * and audit-logged by the underlying importers.
 */
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export type AssistantKind =
  | "fee-payments"
  | "marks"
  | "students"
  | "staff"
  | "fees"
  | "attendance"
  | "subjects";

export type AssistantProposal = {
  kind: AssistantKind;
  label: string;
  summary: string;
  mapping: Record<string, string>; // canonical key → source header
};

// ── Header classification ───────────────────────────────────────────

const hasAny = (headers: string[], needles: string[]): boolean =>
  headers.some((h) => {
    const hl = h.toLowerCase();
    return needles.some((n) => hl.includes(n));
  });

export function classifyKind(headers: string[], _sampleRows: Record<string, string>[]): AssistantKind {
  const has = (needles: string[]) => hasAny(headers, needles);

  const moneyCols = has(["paid", "amount", "payment", "fee", "balance", "received", "tuition"]);
  const nameCols = has(["name", "student", "learner", "pupil"]);
  const admCols = has(["adm", "admission", "reg no", "student no", "index no"]);
  // NB: bare "grade" is deliberately NOT a marks signal — schools routinely
  // use "Grade" as the class-level column in student rosters, and routing
  // those to marks would misclassify the whole file.
  const subjectCols = has(["subject", "score", "marks", "exam"]);
  const classCols = has(["class", "grade", "form", "stream"]);
  const attendCols = has(["attendance", "status", "present", "absent", "late"]);

  if (moneyCols && !subjectCols && (admCols || nameCols)) return "fee-payments";
  if (subjectCols && (admCols || nameCols)) return "marks";
  if (attendCols && (admCols || nameCols)) return "attendance";
  if (moneyCols && classCols) return "fees";
  if (has(["subject", "course"]) && has(["code", "level", "stage"])) return "subjects";
  if (has(["staff", "teacher", "employee", "tsc"])) return "staff";
  if (nameCols && classCols) return "students";
  return "students";
}

// ── Column mapping suggestion ───────────────────────────────────────

const findHeader = (
  headers: string[],
  needles: string[]
): string | undefined =>
  headers.find((h) => {
    const hl = h.toLowerCase();
    return needles.some((n) => hl.includes(n));
  });

export function suggestMapping(kind: AssistantKind, headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const pick = (key: string, needles: string[]) => {
    const hit = findHeader(headers, needles);
    if (hit) mapping[key] = hit;
  };

  switch (kind) {
    case "fee-payments":
      pick("admNo", ["adm", "admission", "reg no", "student no", "index no"]);
      pick("studentName", ["name", "student", "learner"]);
      pick("amountPaid", ["amount paid", "paid", "payment", "amount", "received", "fee paid"]);
      pick("method", ["method", "mode", "means"]);
      pick("date", ["date", "payment date", "transaction date"]);
      pick("reference", ["reference", "ref", "receipt", "mpesa"]);
      break;
    case "marks":
      pick("admNo", ["adm", "admission", "reg no", "student no", "index no"]);
      pick("studentName", ["name", "student", "learner", "pupil"]);
      pick("className", ["class", "grade", "form", "stream"]);
      pick("subjectName", ["subject", "course"]);
      pick("marks", ["score", "marks", "mark"]);
      pick("grade", ["grade"]);
      pick("comment", ["comment", "teacher comment"]);
      break;
    case "students":
      pick("fullName", ["full name", "student name", "learner name", "name"]);
      pick("firstName", ["first name", "firstname", "fname"]);
      pick("lastName", ["last name", "lastname", "surname"]);
      pick("admNo", ["adm", "admission", "reg no", "student no", "index no"]);
      pick("className", ["class", "grade", "form", "stream"]);
      pick("streamName", ["stream", "arm"]);
      // Phase 18: gender / DOB are school-defined EAV fields — not canonical
      // system keys — so they're not proposed here. The Import Studio maps
      // them to the school's EAV fields (Gender, Date of Birth, …) instead.
      // Guardian keys stay: they feed the guardian ENTITY system.
      pick("guardianName", ["guardian", "parent"]);
      pick("guardianPhone", ["guardian phone", "parent phone", "phone", "mobile"]);
      break;
    case "staff":
      pick("staffName", ["staff name", "teacher name", "employee name", "name"]);
      pick("staffNo", ["staff no", "staff number", "tsc", "employee no", "emp no"]);
      pick("role", ["role", "job title", "designation", "position"]);
      pick("department", ["department", "faculty"]);
      pick("staffPhone", ["phone", "mobile", "tel"]);
      pick("staffEmail", ["email"]);
      break;
    case "fees":
      pick("feeClassName", ["class", "grade", "form", "level"]);
      pick("feeStreamName", ["stream"]);
      pick("feeAmount", ["fee", "amount", "tuition"]);
      break;
    case "attendance":
      pick("admNo", ["adm", "admission", "reg no", "student no", "index no"]);
      pick("studentName", ["name", "student", "learner"]);
      pick("attendStatus", ["attendance", "status", "present", "absent", "late"]);
      pick("date", ["date", "day"]);
      break;
    case "subjects":
      pick("subjectName", ["subject", "course"]);
      pick("subjectCode", ["code"]);
      pick("level", ["level", "stage", "class", "grade"]);
      break;
  }
  return mapping;
}

const KIND_LABELS: Record<AssistantKind, string> = {
  "fee-payments": "Fee payments & balances",
  marks: "Exam marks / results",
  students: "Student records",
  staff: "Staff records",
  fees: "Fee schedule",
  attendance: "Attendance",
  subjects: "Subject catalog",
};

/**
 * Classify an uploaded file and build the consent proposal. Deterministic;
 * no LLM call, so it always works and never invents columns — headers it
 * can't map simply stay unmapped for the user to complete.
 */
export const proposeImport = action({
  args: {
    schoolId: v.id("schools"),
    fileName: v.string(),
    headers: v.array(v.string()),
    sampleRows: v.array(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args): Promise<AssistantProposal> => {
    // Actions have no `db`, so requirePrincipal doesn't apply here — this is
    // the same org-gated pattern as aiAssistant.verifySchoolAccess.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!identity.org_id) throw new Error("No active organisation — select a school first");
    const school = await ctx.runQuery(internal.schools.getById, { id: args.schoolId });
    if (!school) throw new Error("School not found");
    if (school.clerkOrgId !== identity.org_id) {
      throw new Error("Not authorised for this school");
    }
    const kind = classifyKind(args.headers, args.sampleRows);
    const mapping = suggestMapping(kind, args.headers);
    const mappedCount = Object.keys(mapping).length;
    return {
      kind,
      label: KIND_LABELS[kind],
      summary: `"${args.fileName}" looks like ${KIND_LABELS[kind].toLowerCase()} — ${mappedCount} column${
        mappedCount === 1 ? "" : "s"
      } matched. Review the mapping and approve to import.`,
      mapping,
    };
  },
});
