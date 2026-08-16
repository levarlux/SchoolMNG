"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { resolveClassStream } from "../../convex/classResolver";
import type { ClassRef, StreamRef, StudentRef } from "../../convex/classResolver";
import { useSchool } from "@/lib/use-school";
import { processDocument } from "@/lib/document-processor";
import { classifyDocumentFile, KIND_GUIDES, type DocKind } from "@/lib/file-classifier";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Sparkles, ArrowLeft, ArrowRight, FileDown, Plus, X, Users, User, Coins, CalendarCheck, BookOpen, School, CalendarDays, FileText } from "lucide-react";
import { toast } from "sonner";

// ── Field groups + friendly aliases for auto-mapping ────────────────

type FieldDef = { key: string; label: string; required: boolean; aliases: string[] };

// Server catalog field (convex/importCatalog.ts) — adds EAV metadata for the
// school's own custom + seeded fields (module/section/bucket/inputType).
type CatalogFieldDef = FieldDef & {
  fieldId?: string;
  sectionId?: string;
  sectionName?: string;
  moduleName?: string;
  bucket?: string;
  inputType?: string;
  options?: string[];
};

const STUDENT_FIELDS: FieldDef[] = [
  { key: "fullName", label: "Full Name", required: false, aliases: ["full name", "fullname", "student name", "name", "learner name"] },
  { key: "firstName", label: "First Name", required: false, aliases: ["first name", "firstname", "fname", "f name", "given name"] },
  { key: "lastName", label: "Last Name", required: false, aliases: ["last name", "lastname", "lname", "surname", "family name"] },
  { key: "admNo", label: "Admission No", required: false, aliases: ["adm no", "admission no", "admission number", "admno", "reg no", "registration number", "student no", "student number", "adm", "index no"] },
  { key: "className", label: "Class", required: true, aliases: ["class", "class name", "grade", "form", "current class"] },
  { key: "streamName", label: "Stream", required: false, aliases: ["stream", "stream name"] },
  // Phase 18: gender / DOB / admissionDate are NOT system columns — they are
  // the school's own EAV fields (Gender, Date of Birth, Admission Date) and
  // arrive through the catalog as eav:<fieldId> mappings.
  { key: "status", label: "Status", required: false, aliases: ["status", "student status"] },
  // Guardian fields stay (they feed the guardian ENTITY system, not students).
  { key: "guardianName", label: "Guardian Name", required: false, aliases: ["guardian name", "parent name", "parent", "guardian", "parent/guardian", "guardians name"] },
  { key: "guardianRelation", label: "Relationship", required: false, aliases: ["relationship", "relation", "guardian relation"] },
  { key: "guardianPhone", label: "Guardian Phone", required: false, aliases: ["guardian phone", "parent phone", "parent phone number", "guardian phone number", "parent mobile", "mobile number", "phone", "phone number", "tel", "telephone", "contact", "mobile"] },
  { key: "guardianPhone2", label: "Alternative Phone", required: false, aliases: ["alternative phone", "second phone", "phone 2", "other phone", "guardian phone 2", "phone 2nd"] },
  { key: "guardianEmail", label: "Guardian Email", required: false, aliases: ["guardian email", "parent email", "email", "email address"] },
  { key: "homeAddress", label: "Home Address", required: false, aliases: ["home address", "address", "residence", "location"] },
  { key: "emergencyName", label: "Emergency Contact", required: false, aliases: ["emergency contact", "emergency name", "next of kin"] },
  { key: "emergencyPhone", label: "Emergency Phone", required: false, aliases: ["emergency phone", "emergency contact phone", "emergency number"] },
];

const STAFF_FIELDS: FieldDef[] = [
  { key: "staffName", label: "Staff Name", required: true, aliases: ["teacher name", "staff name", "teacher", "staff", "employee name", "employee", "full name", "name"] },
  { key: "staffNo", label: "Staff / TSC No", required: false, aliases: ["staff no", "staff number", "employee no", "employee number", "tsc no", "tsc", "payroll no", "emp no", "staff id"] },
  { key: "role", label: "Role / Job Title", required: false, aliases: ["role", "job title", "designation", "position", "title", "occupation", "job"] },
  { key: "department", label: "Department", required: false, aliases: ["department", "faculty", "subject department"] },
  { key: "staffPhone", label: "Staff Phone", required: false, aliases: ["phone", "phone number", "mobile", "tel", "telephone", "contact"] },
  { key: "staffEmail", label: "Staff Email", required: false, aliases: ["email", "email address", "work email"] },
];



const ATTENDANCE_FIELDS: FieldDef[] = [
  { key: "admNo", label: "Admission No", required: true, aliases: ["adm no", "admission no", "admission number", "admno", "reg no", "student no", "student number", "index no"] },
  { key: "studentName", label: "Student Name", required: false, aliases: ["student name", "full name", "name", "learner name", "pupil name"] },
  { key: "attendStatus", label: "Attendance Status", required: true, aliases: ["attendance", "status", "attendance status", "present/absent", "mark", "present", "absent"] },
  { key: "date", label: "Date", required: false, aliases: ["date", "attendance date", "day", "class date"] },
  { key: "period", label: "Period No", required: false, aliases: ["period", "period no", "period number", "lesson", "period #"] },
  { key: "subject", label: "Subject", required: false, aliases: ["subject", "subject name"] },
];



const SUBJECT_FIELDS: FieldDef[] = [
  { key: "subjectName", label: "Subject Name", required: true, aliases: ["subject", "subject name", "course", "course name", "subject title"] },
  { key: "subjectCode", label: "Subject Code", required: false, aliases: ["subject code", "code", "course code", "subject no"] },
  { key: "level", label: "Level", required: false, aliases: ["level", "stage", "class", "grade", "category"] },
];

const CLASS_FIELDS: FieldDef[] = [
  { key: "className", label: "Class", required: true, aliases: ["class", "class name", "grade", "form", "level"] },
  { key: "streamName", label: "Stream", required: false, aliases: ["stream", "stream name", "arm", "section"] },
];

const TERM_FIELDS: FieldDef[] = [
  { key: "termName", label: "Term Name", required: true, aliases: ["term", "term name", "semester", "session", "period"] },
  { key: "termYear", label: "Year", required: true, aliases: ["year", "academic year", "school year"] },
  { key: "startDate", label: "Start Date", required: false, aliases: ["start date", "starts", "begin date", "opens", "term start"] },
  { key: "endDate", label: "End Date", required: false, aliases: ["end date", "ends", "close date", "closes", "term end"] },
];

const TEMPLATE_HEADERS = STUDENT_FIELDS.map((f) => f.label);

// Rows sent per `importBatch` call. Keeps each action payload well under
// Convex's 8192-element array / argument-size limits while the server-side
// chunker (`IMPORT_CHUNK`) keeps each transaction small — so files of any
// size can be imported in one go.
const IMPORT_CALL_ROWS = 1000;

function chunkRows<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeHeader(h: string) {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreHeader(header: string, field: FieldDef): number {
  const norm = normalizeHeader(header);
  if (!norm) return 0;
  for (const alias of field.aliases) {
    const a = normalizeHeader(alias);
    if (a === norm) return 3;
    if (norm.startsWith(a) || a.startsWith(norm)) return 2;
    // Substring matching is only safe for long, distinctive aliases. Short
    // ones ("name", "fee", "sex", "adm", "dob") would let a generic field
    // like fullName steal "FirstName"/"LastName" — the cause of whole-file
    // "Missing student name" import failures.
    if (a.length >= 5 && (norm.includes(a) || a.includes(norm))) return 1;
  }
  return 0;
}

/** Auto-assign source headers to canonical fields (best unique match). */
function autoMap(fields: FieldDef[], headers: string[], used: Set<string>): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    if (field.key === "firstName" || field.key === "lastName") continue;
    let best: { header: string; score: number } | null = null;
    for (const header of headers) {
      if (used.has(header)) continue;
      const s = scoreHeader(header, field);
      if (s > 0 && (!best || s > best.score)) best = { header, score: s };
    }
    if (best) {
      mapping[field.key] = best.header;
      used.add(best.header);
    }
  }
  return mapping;
}

function autoMapNames(headers: string[], used: Set<string>): Record<string, string> {
  const mapping: Record<string, string> = {};
  const fullNameHeader = headers.find((h) => {
    const norm = normalizeHeader(h);
    return !used.has(h) && (norm.includes("full name") || norm.includes("fullname") || norm === "name" || norm === "student name" || norm === "learner name" || norm.includes("teacher name") || norm.includes("staff name"));
  });
  if (fullNameHeader) {
    mapping["fullName"] = fullNameHeader;
    used.add(fullNameHeader);
    return mapping;
  }
  const firstNameHeader = headers.find((h) => {
    const norm = normalizeHeader(h);
    return !used.has(h) && (norm.includes("first name") || norm.includes("firstname") || norm.includes("fname") || norm.includes("given name"));
  });
  const lastNameHeader = headers.find((h) => {
    const norm = normalizeHeader(h);
    return !used.has(h) && (norm.includes("last name") || norm.includes("lastname") || norm.includes("lname") || norm.includes("surname") || norm.includes("family name"));
  });
  if (firstNameHeader) {
    mapping["firstName"] = firstNameHeader;
    used.add(firstNameHeader);
  }
  if (lastNameHeader) {
    mapping["lastName"] = lastNameHeader;
    used.add(lastNameHeader);
  }
  return mapping;
}

function buildMapping(headers: string[], eavFields: CatalogFieldDef[] = []): Record<string, string> {
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  // Reserve name columns FIRST so firstName/lastName/fullName can never be
  // stolen by a generic field (previously fullName's weak "name" alias
  // grabbed "FirstName" and every row failed as "Missing student name").
  Object.assign(mapping, autoMapNames(headers, used));
  Object.assign(mapping, autoMap(STUDENT_FIELDS, headers, used));
  Object.assign(mapping, autoMap(STAFF_FIELDS, headers, used));
Object.assign(mapping, autoMap(ATTENDANCE_FIELDS, headers, used));
Object.assign(mapping, autoMap(SUBJECT_FIELDS, headers, used));
  Object.assign(mapping, autoMap(CLASS_FIELDS, headers, used));
  Object.assign(mapping, autoMap(TERM_FIELDS, headers, used));
  // School EAV fields map only where a distinctive alias matches — system
  // fields run first, so a shared alias (e.g. "address") always prefers the
  // system column and EAV never steals it.
  Object.assign(mapping, autoMap(eavFields, headers, used));
  return mapping;
}

// ── Value normalization helpers ─────────────────────────────────────

function toDateTimestamp(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d{5}$/.test(s) && Number(s) > 20000) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const dm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dm) {
    const [, d, m, y] = dm;
    const ts = new Date(`${y.length === 2 ? "20" + y : y}-${m}-${d}`).getTime();
    if (!isNaN(ts)) return ts;
  }
  const ts = Date.parse(s);
  return isNaN(ts) ? undefined : ts;
}

function normalizeStatus(v: unknown): "active" | "graduated" | "withdrawn" | "suspended" | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (["active", "enrolled"].includes(s)) return "active";
  if (["graduated", "graduate"].includes(s)) return "graduated";
  if (["withdrawn", "left"].includes(s)) return "withdrawn";
  if (["suspended"].includes(s)) return "suspended";
  return undefined;
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseAmount(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : undefined;
  const s = String(v).trim().replace(/[^\d.\-]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : undefined;
}

// ── File kind detection ─────────────────────────────────────────────

type FileKind =
  | "students"
  | "staff"
  | "fees"
  | "attendance"
  | "fee-payments"
  | "subjects"
  | "classes"
  | "terms"
  | "school-docs";

// Canonical system field lists per kind (identical to the server's
// SYSTEM_FIELDS in convex/importCatalog.ts). The school's own EAV fields are
// added on top at runtime via `importCatalog`, so custom fields become
// importable without a client-side code change.
const SYSTEM_FIELDS_BY_KIND: Record<Exclude<FileKind, "school-docs">, FieldDef[]> = {
  students: STUDENT_FIELDS,
  staff: STAFF_FIELDS,
  fees: [],
  attendance: ATTENDANCE_FIELDS,
  "fee-payments": [],
  subjects: SUBJECT_FIELDS,
  classes: CLASS_FIELDS,
  terms: TERM_FIELDS,
};

// Importable kinds for mapping profiles (mirrors convex/importMappings.ts).
type ImportKindKey =
  | "students"
  | "staff"
  | "fees"
  | "attendance"
  | "fee-payments"
  | "subjects"
  | "classes"
  | "terms";

const HONORIFIC_RE = /^(mr|mrs|ms|miss|dr|prof|professor|sir|madam|mama|bwana|mzee|teacher|rev|fr)\b\.?\s+/i;
const TEACHING_ROLE_RE = /teacher|tutor|lecturer|instructor|head.?teacher|principal|deputy|dean|counselor|governor/i;
const NON_TEACHING_ROLE_RE = /driver|cleaner|cook|chef|security|guard|watchman|askari|nurse|secretary|bursar|accountant|clerk|cashier|grounds|groundsman|gardener|janitor|attendant|reception|porter|technician|laboratory|librarian|support|house|chef|matron|warden/i;

/** FileKind labels used in the UI. */
export const KIND_LABELS: Record<FileKind, string> = {
  students: "Students",
  staff: "Staff",
  fees: "Fee schedule",
  attendance: "Attendance",
  "fee-payments": "Fee payments & balances",
  subjects: "Subjects",
  classes: "Classes & Streams",
  terms: "Terms",
  "school-docs": "School document",
};

/**
 * Decide what a file contains. Uses the shared smart classifier (headers +
 * filename + a content sample) so a teacher list, fee schedule, or attendance
 * register is routed to its own section instead of being treated as students.
 * `autoKind` is the raw classifier result (may be school-info/logs/unknown);
 * `kind` is the importable kind we run it as.
 */
function detectFileKind(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName: string,
  text?: string
): { autoKind: DocKind; kind: FileKind } {
  const cls = classifyDocumentFile(headers, rows, fileName, text);
  const autoKind = cls.kind;
  const kind: FileKind =
    autoKind === "staff" ||
    autoKind === "fees" ||
    autoKind === "attendance" ||
    autoKind === "fee-payments" ||
    autoKind === "subjects" ||
    autoKind === "classes" ||
    autoKind === "terms"
      ? autoKind
      : autoKind === "school-docs" || autoKind === "school-info" ||
          autoKind === "admission-letters" || autoKind === "report-cards" ||
          autoKind === "transfer-letters" || autoKind === "logs"
        ? "school-docs"
        : "students";
  return { autoKind, kind };
}

function classifyStaffCategory(role: string): "teaching" | "non_teaching" {
  if (role && NON_TEACHING_ROLE_RE.test(role)) return "non_teaching";
  return "teaching";
}

// ── Row building ────────────────────────────────────────────────────

type MappedStudentRow = {
  firstName: string;
  lastName: string;
  admNo: string;
  className: string;
  streamName?: string;
  // Phase 18: gender / dateOfBirth / admissionDate are school-defined EAV
  // fields — they arrive as mapped "eav:<fieldId>" keys inside eavValues.
  status?: "active" | "graduated" | "withdrawn" | "suspended";
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  guardianPhone2?: string;
  guardianEmail?: string;
  homeAddress?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  // Phase 17C: mapped school EAV values, keyed by "eav:<fieldId>". Written to
  // records/fieldValues server-side alongside the system columns.
  eavValues?: Record<string, string>;
};

type MappedStaffRow = {
  firstName: string;
  lastName: string;
  staffNo: string;
  category: "teaching" | "non_teaching";
  email?: string;
  phone?: string;
  department?: string;
  eavValues?: Record<string, string>;
};

type MappedFeeRow = {
  className: string;
  streamName?: string;
  amount: number;
  termName?: string;
  termYear?: number;
};

type MappedAttendanceRow = {
  admNo: string;
  status: "present" | "absent" | "late";
  date: number | undefined;
  period: number | undefined;
  subject?: string;
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(HONORIFIC_RE, "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Collect the school EAV values a mapped row carries. Only `eav:` keys are
// considered; `eavKeys` (when given) restricts to a specific field set — e.g.
// staff rows detected inside a students file must never pick up learner-bucket
// custom fields. Returns undefined when nothing mapped, keeping the payload
// minimal.
function collectEavValues(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  eavKeys?: Set<string>
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, header] of Object.entries(mapping)) {
    if (!key.startsWith("eav:")) continue;
    if (eavKeys && !eavKeys.has(key)) continue;
    const v = cellToString(raw[header]);
    if (v) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function buildStudentRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  index: number,
  eavKeys?: Set<string>
): MappedStudentRow {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  let firstName = cellToString(get("firstName"));
  let lastName = cellToString(get("lastName"));
  const fullName = cellToString(get("fullName"));
  if (!firstName && !lastName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      firstName = parts[0];
      lastName = "";
    } else if (parts.length === 2) {
      firstName = parts[0];
      lastName = parts[1];
    } else {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }
  let admNo = cellToString(get("admNo"));
  if (!admNo) admNo = `AUTO-${String(index + 1).padStart(4, "0")}`;
  return {
    firstName,
    lastName,
    admNo,
    className: cellToString(get("className")),
    streamName: cellToString(get("streamName")) || undefined,
    status: normalizeStatus(get("status")),
    guardianName: cellToString(get("guardianName")) || undefined,
    guardianRelation: cellToString(get("guardianRelation")) || undefined,
    guardianPhone: cellToString(get("guardianPhone")) || undefined,
    guardianPhone2: cellToString(get("guardianPhone2")) || undefined,
    guardianEmail: cellToString(get("guardianEmail")) || undefined,
    homeAddress: cellToString(get("homeAddress")) || undefined,
    emergencyName: cellToString(get("emergencyName")) || undefined,
    emergencyPhone: cellToString(get("emergencyPhone")) || undefined,
    eavValues: collectEavValues(raw, mapping, eavKeys),
  };
}

function buildStaffRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  index: number,
  category: "teaching" | "non_teaching",
  eavKeys?: Set<string>
): MappedStaffRow {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  // Preferred: a full-name column (Staff Name / Teacher Name / Full Name).
  // Fallback: separate FirstName + LastName columns (mapped by autoMapNames).
  const fullName = cellToString(get("staffName")) || cellToString(get("fullName"));
  let firstName = "";
  let lastName = "";
  if (fullName) {
    ({ firstName, lastName } = splitName(fullName));
  } else {
    firstName = cellToString(get("firstName"));
    lastName = cellToString(get("lastName"));
  }
  let staffNo = cellToString(get("staffNo"));
  if (!staffNo) staffNo = `AUTO-${String(index + 1).padStart(4, "0")}`;
  return {
    firstName,
    lastName,
    staffNo,
    category,
    email: cellToString(get("staffEmail")) || undefined,
    phone: cellToString(get("staffPhone")) || undefined,
    department: cellToString(get("department")) || cellToString(get("role")) || undefined,
    eavValues: collectEavValues(raw, mapping, eavKeys),
  };
}

function buildFeeRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): MappedFeeRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const className = cellToString(get("feeClassName")) || cellToString(get("className"));
  const amount = parseAmount(get("feeAmount"));
  if (!className || amount === undefined) return null;
  const termYear = parseInt(cellToString(get("feeTermYear")), 10);
  return {
    className,
    streamName: cellToString(get("feeStreamName")) || undefined,
    amount,
    termName: cellToString(get("feeTermName")) || undefined,
    termYear: Number.isFinite(termYear) ? termYear : undefined,
  };
}

function normalizeAttendanceStatus(v: unknown): "present" | "absent" | "late" | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (["p", "present", "1", "true", "y", "yes", "v", "✓"].includes(s)) return "present";
  if (["a", "absent", "0", "false", "n", "no", "x", "✗"].includes(s)) return "absent";
  if (["l", "late", "t"].includes(s)) return "late";
  return undefined;
}

function buildAttendanceRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): MappedAttendanceRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const admNo = cellToString(get("admNo")) || cellToString(get("studentName"));
  const status = normalizeAttendanceStatus(get("attendStatus"));
  if (!admNo || !status) return null;
  return {
    admNo,
    status,
    date: toDateTimestamp(get("date")),
    period: parseAmount(get("period")) !== undefined ? Math.round(parseAmount(get("period"))!) : undefined,
    subject: cellToString(get("subject")) || undefined,
  };
}

type MappedFeePaymentRow = {
  admNo: string;
  studentName: string;
  amount: number;
  balance?: number;
  method: "cash" | "mpesa" | "bank_transfer" | "other";
  date?: number;
  reference?: string;
  termName?: string;
  termYear?: number;
};

type MappedSubjectRow = {
  name: string;
  code: string;
  level?: "pre_primary" | "lower_primary" | "upper_primary" | "junior_secondary" | "senior_secondary" | "general";
};

type MappedClassRow = { className: string; streamName?: string };

type MappedTermRow = {
  name: string;
  year: number;
  startDate?: number;
  endDate?: number;
};

function normalizePaymentMethod(v: unknown): "cash" | "mpesa" | "bank_transfer" | "other" {
  const s = String(v ?? "").trim().toLowerCase();
  if (/cash|cheque|check|bank slip/.test(s)) return "cash";
  if (/mpesa|m-pesa|m pesa|safaricom|mobile money/.test(s)) return "mpesa";
  if (/bank|transfer|wire|eft|rtgs/.test(s)) return "bank_transfer";
  return "other";
}

function normalizeSubjectLevel(
  v: unknown
): MappedSubjectRow["level"] | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (/pre|kindergarten|nursery|pp1|pp2/.test(s)) return "pre_primary";
  if (/lower/.test(s)) return "lower_primary";
  if (/upper/.test(s)) return "upper_primary";
  if (/junior/.test(s)) return "junior_secondary";
  if (/senior/.test(s)) return "senior_secondary";
  return undefined;
}

function buildFeePaymentRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): MappedFeePaymentRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const amount = parseAmount(get("amountPaid"));
  if (amount === undefined) return null;
  const admNo = cellToString(get("admNo"));
  const studentName =
    cellToString(get("studentName")) ||
    cellToString(get("fullName")) ||
    [cellToString(get("firstName")), cellToString(get("lastName"))].join(" ").trim();
  if (!admNo && !studentName) return null;
  return {
    admNo,
    studentName,
    amount,
    balance: parseAmount(get("balance")),
    method: normalizePaymentMethod(get("method")),
    date: toDateTimestamp(get("date")),
    reference: cellToString(get("reference")) || undefined,
    termName: cellToString(get("feePaymentTermName")) || undefined,
    termYear: (() => {
      const y = parseInt(cellToString(get("feePaymentTermYear")), 10);
      return Number.isFinite(y) ? y : undefined;
    })(),
  };
}

function buildSubjectRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
  index: number
): MappedSubjectRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const name = cellToString(get("subjectName"));
  if (!name) return null;
  return {
    name,
    code: cellToString(get("subjectCode")) || `SUB-${String(index + 1).padStart(3, "0")}`,
    level: normalizeSubjectLevel(get("level")),
  };
}

function buildClassRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): MappedClassRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const className = cellToString(get("className"));
  if (!className) return null;
  return {
    className,
    streamName: cellToString(get("streamName")) || undefined,
  };
}

function buildTermRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): MappedTermRow | null {
  const get = (field: string) => (mapping[field] ? raw[mapping[field]] : undefined);
  const name = cellToString(get("termName"));
  const yearRaw = cellToString(get("termYear"));
  const year = Number(yearRaw.replace(/\D/g, ""));
  if (!name || !(year > 2000)) return null;
  return {
    name,
    year,
    startDate: toDateTimestamp(get("startDate")),
    endDate: toDateTimestamp(get("endDate")),
  };
}

// ── Issues ──────────────────────────────────────────────────────────

type Issue = { row: number; type: "error" | "warn"; reason: string };

function buildStudentIssues(
  rows: MappedStudentRow[],
  existingAdmNos: Set<string>,
  classNames: Set<string>,
  createMissingClasses: boolean
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    const hasName = r.firstName.trim() !== "";
    const hasClass = r.className.trim() !== "";
    if (!hasName) issues.push({ row: rowNum, type: "error", reason: "Missing student name (first name or full name required)" });
    if (!hasClass) issues.push({ row: rowNum, type: "error", reason: "Missing class (required)" });
    const key = r.admNo.trim().toLowerCase();
    if (key.startsWith("auto-")) {
      issues.push({ row: rowNum, type: "warn", reason: "No admission number — auto-generated as " + r.admNo });
    } else if (seen.has(key)) {
      issues.push({ row: rowNum, type: "error", reason: "Duplicate admission number within the file" });
    } else {
      seen.add(key);
      if (existingAdmNos.has(key)) {
        issues.push({ row: rowNum, type: "warn", reason: "Admission number already exists — will be skipped" });
      }
    }
    if (r.className && !classNames.has(r.className.toLowerCase().trim())) {
      issues.push({
        row: rowNum,
        type: createMissingClasses ? "warn" : "error",
        reason: createMissingClasses
          ? `Class "${r.className}" does not exist — will be created (approved)`
          : `Class "${r.className}" does not exist — create it first or approve auto-create`,
      });
    }
  });
  return issues;
}

function buildStaffIssues(rows: MappedStaffRow[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.firstName.trim()) issues.push({ row: rowNum, type: "error", reason: "Missing staff name" });
    const key = r.staffNo.trim().toLowerCase();
    if (key.startsWith("auto-")) {
      issues.push({ row: rowNum, type: "warn", reason: "No staff number — auto-generated as " + r.staffNo });
    } else if (seen.has(key)) {
      issues.push({ row: rowNum, type: "error", reason: "Duplicate staff number within the file" });
    } else {
      seen.add(key);
    }
  });
  return issues;
}

function buildFeeIssues(
  rows: MappedFeeRow[],
  classRefs: ClassRef[],
  streamRefs: StreamRef[],
  studentRefs: StudentRef[],
  createMissingClasses: boolean
): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.className.trim()) {
      issues.push({ row: rowNum, type: "error", reason: "Missing class name" });
      return;
    }
    const outcome = resolveClassStream(
      { className: r.className, streamName: r.streamName },
      classRefs,
      streamRefs,
      studentRefs
    );
    if (outcome.status === "ambiguous") {
      issues.push({
        row: rowNum,
        type: "error",
        reason: `Class "${r.className}" is ambiguous — it matches ${outcome.matches
          .map((m) => m.label)
          .join(" and ")}. Split it into Class + Stream columns, or fix the mapping.`,
      });
    } else if (outcome.status === "nomatch") {
      issues.push({
        row: rowNum,
        type: createMissingClasses ? "warn" : "error",
        reason: createMissingClasses
          ? `Class "${r.className}" does not exist — will be created (approved)`
          : `Class "${r.className}" does not exist — create it first or approve auto-create`,
      });
    }
  });
  return issues;
}

function buildAttendanceIssues(rows: MappedAttendanceRow[]): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.admNo.trim()) issues.push({ row: rowNum, type: "error", reason: "Missing admission number or student name" });
    if (!r.date) issues.push({ row: rowNum, type: "warn", reason: "No date found — today's date will be used" });
  });
  return issues;
}

function buildFeePaymentIssues(rows: MappedFeePaymentRow[], knownAdmNos: Set<string>): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.admNo.trim() && !r.studentName.trim()) {
      issues.push({ row: rowNum, type: "error", reason: "Missing student reference (admission number or name)" });
    }
    if (!(r.amount > 0)) {
      issues.push({ row: rowNum, type: "error", reason: "Missing or invalid amount paid" });
    }
    if (r.admNo.trim() && !r.admNo.trim().toLowerCase().startsWith("auto-") && !knownAdmNos.has(r.admNo.trim().toLowerCase())) {
      issues.push({ row: rowNum, type: "warn", reason: `Admission number "${r.admNo}" not found — row will be reported back` });
    }
  });
  return issues;
}

function buildSubjectIssues(rows: MappedSubjectRow[]): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    if (!r.name.trim()) issues.push({ row: i + 2, type: "error", reason: "Missing subject name" });
  });
  return issues;
}

function buildClassIssues(rows: MappedClassRow[], classNames: Set<string>): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.className.trim()) issues.push({ row: rowNum, type: "error", reason: "Missing class name" });
    if (r.className && classNames.has(r.className.trim().toLowerCase())) {
      issues.push({ row: rowNum, type: "warn", reason: `Class "${r.className}" already exists` });
    }
  });
  return issues;
}

function buildTermIssues(rows: MappedTermRow[]): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.name.trim()) issues.push({ row: rowNum, type: "error", reason: "Missing term name" });
    if (!(r.year > 2000)) issues.push({ row: rowNum, type: "error", reason: "Missing or invalid year" });
    if (r.startDate && r.endDate && r.startDate > r.endDate) {
      issues.push({ row: rowNum, type: "error", reason: "Start date is after end date" });
    }
  });
  return issues;
}

// ── File queue entry ────────────────────────────────────────────────

type FileImportResult = {
  students?: {
    created: number;
    skippedDuplicates: number;
    overwritten: number;
    guardiansCreated: number;
    guardianLinksCreated: number;
    errors: { row: number; reason: string }[];
    createdClasses: string[];
    createdStreams: string[];
    rowResults: {
      row: number;
      status: "created" | "skipped" | "overwritten" | "error";
      reason?: string;
      studentId?: string;
    }[];
  };
  staff?: {
    created: number;
    skipped: number;
    overwritten: number;
    teaching: number;
    nonTeaching: number;
    errors: { row: number; reason: string }[];
    rowResults: {
      row: number;
      status: "created" | "skipped" | "overwritten" | "error";
      reason?: string;
      studentId?: string;
    }[];
  };
  fees?: {
    structuresCreated: number;
    errors: { row: number; reason: string }[];
    createdTerm: boolean;
    termName?: string;
    termYear?: number;
    resolutions?: { row: number; className: string; streamName?: string; matchedClass: string; matchedStream?: string }[];
  };
  attendance?: {
    created: number;
    errors: { row: number; reason: string }[];
  };
  feePayments?: {
    created: number;
    errors: { row: number; reason: string }[];
  };
  subjects?: {
    created: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  };
  classes?: {
    classesCreated: number;
    streamsCreated: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  };
  terms?: {
    termsCreated: number;
    academicYearsCreated: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  };
  schoolDocs?: {
    recognized: number;
  };
};

type FileEntry = {
  id: string;
  file: File;
  fileName: string;
  parseStatus: "pending" | "parsing" | "ready" | "error";
  parseError?: string;
  headers: string[];
  rawRows: Record<string, unknown>[];
  docText?: string;
  mapping: Record<string, string>;
  kind: FileKind;
  autoKind?: DocKind;
  importStatus: "queued" | "importing" | "done" | "error";
  importError?: string;
  report?: FileImportResult;
};

type ImportReport = {
  studentsCreated: number;
  studentsSkipped: number;
  studentsOverwritten: number;
  staffCreated: number;
  staffOverwritten: number;
  staffTeaching: number;
  staffNonTeaching: number;
  guardiansCreated: number;
  guardianLinksCreated: number;
  structuresCreated: number;
  attendanceCreated: number;
  feePaymentsCreated: number;
  subjectsCreated: number;
  classesCreated: number;
  streamsCreated: number;
  termsCreated: number;
  schoolDocsRecognized: number;
  manualFeeApplied: boolean;
  manualFeeAmount?: number;
  manualFeeClassCount?: number;
  createdClasses: string[];
  createdStreams: string[];
  errors: { file: string; row: number; reason: string }[];
  failedFiles: number;
  termCreated?: { name: string; year: number } | null;
};

type FilePreview = {
  entry: FileEntry;
  kind: FileKind;
  studentRows: MappedStudentRow[];
  staffRows: MappedStaffRow[];
  feeRows: MappedFeeRow[];
  attendanceRows: MappedAttendanceRow[];
  feePaymentRows: MappedFeePaymentRow[];
  subjectRows: MappedSubjectRow[];
  classRows: MappedClassRow[];
  termRows: MappedTermRow[];
  issues: Issue[];
  errorCount: number;
  warnCount: number;
};

// ── Phase 2.2: duplicate matching + per-row resolution ───────────────

type RowResolution = "create" | "skip" | "overwrite" | "keep_both";

type StudentRowMatch = {
  index: number;
  status: "new" | "duplicate" | "conflicting";
  reasons: string[];
  matched?: { id: string; name: string; admNo: string; className: string };
};

type StaffRowMatch = {
  index: number;
  status: "new" | "duplicate" | "conflicting";
  reasons: string[];
  matched?: { id: string; name: string; staffNo: string };
};

// ── Component ───────────────────────────────────────────────────────

type Step = "upload" | "map" | "review" | "done";

// ── Onboarding cross-reference context (optional) ───────────────────
// Manual answers the principal typed in the onboarding wizard. The importer
// uses them to resolve term creation and a default fee structure when no fee
// file is present — every source (manual answers, uploaded files, existing
// DB) is cross-referenced before anything is routed to its destination.

export type OnboardingContext = {
  feePerStudent?: string;
  currentTermName?: string;
  currentTermYear?: number;
  termsPerYear?: number;
};

export function ImportStudio({
  open,
  onClose,
  onboarding,
}: {
  open: boolean;
  onClose: () => void;
  onboarding?: OnboardingContext;
}) {
  const school = useSchool();
  const importBatch = useAction(api.imports.importBatch);
  const importAttendance = useAction(api.imports.importAttendance);
  const importFeePayments = useAction(api.imports.importFeePayments);
  const importSubjects = useAction(api.imports.importSubjects);
  const importClasses = useAction(api.imports.importClasses);
  const importTerms = useAction(api.imports.importTerms);
  const aiSuggestMapping = useAction(api.aiAssistant.suggestImportMapping);
  const saveMapping = useMutation(api.importMappings.saveMapping);
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const students = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
  const streams = useQuery(api.streams.listBySchool, school ? { schoolId: school._id } : "skip");
  // Phase 17C: the school's field catalog (system + EAV) drives the mapping UI,
  // and saved per-kind mapping profiles are reused across uploads.
  const importCatalog = useQuery(
    api.importCatalog.getImportCatalog,
    school ? { schoolId: school._id } : "skip"
  );
  const savedMappings = useQuery(
    api.importMappings.listMappings,
    school ? { schoolId: school._id } : "skip"
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [queue, setQueue] = useState<FileEntry[]>([]);
  const [createMissingClasses, setCreateMissingClasses] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [report, setReport] = useState<ImportReport | null>(null);
  // Phase 2.2: per-row duplicate decisions keyed by `${fileId}:${s|t}:${rowIndex}`.
  const [resolutions, setResolutions] = useState<Record<string, RowResolution>>({});
  // AI-assisted mapping: which file is currently being analyzed + the notes shown per file.
  const [aiAnalyzingId, setAiAnalyzingId] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});

  const existingAdmNos = useMemo<Set<string>>(
    () => new Set((students ?? []).map((s) => (s.admNo ?? "").trim().toLowerCase())),
    [students]
  );
  const classNames = useMemo<Set<string>>(
    () => new Set((classes ?? []).map((c) => (c.name ?? "").toLowerCase().trim())),
    [classes]
  );

  // Registry fed to the school-agnostic class resolver for fee previews.
  const classRefs = useMemo<ClassRef[]>(
    () => (classes ?? []).map((c) => ({ id: c._id, name: c.name, hasStreams: c.hasStreams })),
    [classes]
  );
  const streamRefs = useMemo<StreamRef[]>(
    () => (streams ?? []).map((s) => ({ id: s._id, classId: s.classId, name: s.name })),
    [streams]
  );
  const studentRefs = useMemo<StudentRef[]>(
    () =>
      (students ?? []).map((s) => ({
        classId: s.classId,
        streamId: s.streamId === undefined ? undefined : s.streamId,
      })),
    [students]
  );

  // ── Phase 17C: catalog-driven field lists ──────────────────────────
  // `fieldsForKind` is what the Map Columns step renders and what auto-map +
  // AI suggestions operate on: the canonical system fields PLUS the school's
  // own EAV fields for that kind (learners for students; teaching + non-teaching
  // staff buckets for staff). Kinds without EAV buckets get system fields only.
  const eavFieldsForKind = useCallback(
    (kind: FileKind): CatalogFieldDef[] => {
      if (kind === "school-docs" || !importCatalog) return [];
      return importCatalog[kind as Exclude<FileKind, "school-docs">]?.eavFields ?? [];
    },
    [importCatalog]
  );

  const fieldsForKind = useCallback(
    (kind: FileKind): CatalogFieldDef[] => {
      if (kind === "school-docs") return [];
      return [...SYSTEM_FIELDS_BY_KIND[kind], ...eavFieldsForKind(kind)];
    },
    [eavFieldsForKind]
  );

  // EAV field keys belonging to the staff buckets — used to stop staff rows
  // detected inside a students file from picking up learner custom fields.
  const staffEavKeys = useMemo(
    () => new Set(eavFieldsForKind("staff").map((f) => f.key)),
    [eavFieldsForKind]
  );

  const readyFiles = useMemo(() => queue.filter((q) => q.parseStatus === "ready"), [queue]);

  const reset = useCallback(() => {
    setStep("upload");
    setQueue([]);
    setCreateMissingClasses(false);
    setReport(null);
    setRunning(false);
    setCurrentFileIndex(0);
    setResolutions({});
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  // ── Template download ─────────────────────────────────────────────
  function downloadTemplate() {
    const sample = [
      "Biko", "Otieno", "ADM-104", "Grade 7", "North", "Male", "2012-03-14", "2023-01-09",
      "Active", "James Otieno", "Father", "0712 345 678", "0733 000 000",
      "james.otieno@example.com", "Nairobi", "Mary Otieno", "0722 111 222",
    ];
    const csv = [TEMPLATE_HEADERS.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── File parsing ──────────────────────────────────────────────────
  // Returns headers/rows for tabular files, OR extracted prose text for
  // PDF/DOCX/image documents that have no spreadsheet structure (school
  // policy, reports, profile) — those are recognized as school documents
  // instead of failing with an empty "could not extract data" error.
  async function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[]; text?: string }> {
    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];

    const processed = await processDocument(file);
    const text = processed.extractedData.find((d) => d.text && d.text.trim().length > 10)?.text;

    if (processed.totalRows === 0 && !text) {
      throw new Error("No data found in the file");
    }

    if (processed.extractedData[0]?.structuredData && processed.extractedData[0].structuredData.length > 0) {
      headers = processed.allHeaders;
      rows = processed.extractedData[0].structuredData;
    } else if (text) {
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length > 1) {
        const separators = [",", "\t", "|", ";"];
        let bestSeparator = ",";
        let maxColumns = 0;
        for (const sep of separators) {
          const columns = lines[0].split(sep).length;
          if (columns > maxColumns) {
            maxColumns = columns;
            bestSeparator = sep;
          }
        }
        if (maxColumns > 2) {
          headers = lines[0].split(bestSeparator).map((h) => h.trim());
          rows = lines.slice(1).map((line) => {
            const values = line.split(bestSeparator).map((v) => v.trim());
            const row: Record<string, unknown> = {};
            headers.forEach((h, i) => {
              row[h] = values[i] || "";
            });
            return row;
          });
        }
      }
      // Not tabular → prose document (policy/report/profile). Return the
      // text so the caller can classify and preview it as a school document.
      if (headers.length === 0 || rows.length === 0) {
        return { headers: [], rows: [], text };
      }
    }

    headers = headers.filter((h) => h.trim() !== "");
    if (headers.length === 0) {
      throw new Error("No column headers found. Make sure the document has tabular data.");
    }
    if (rows.length === 0) {
      throw new Error("No data rows found in the file.");
    }

    return { headers, rows, text };
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const entries: FileEntry[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      fileName: file.name,
      parseStatus: "pending",
      headers: [],
      rawRows: [],
      mapping: {},
      kind: "students",
      importStatus: "queued",
    }));
    setQueue((q) => [...q, ...entries]);

    for (const entry of entries) {
      setQueue((q) =>
        q.map((e) => (e.id === entry.id ? { ...e, parseStatus: "parsing" } : e))
      );
      try {
        const { headers, rows, text } = await parseFile(entry.file);
        const detected = detectFileKind(headers, rows, entry.fileName, text);
        // Prose documents (PDF/DOCX with no table) are school documents —
        // previewed, recognized, and filed — not row imports.
        const isProseDoc = headers.length === 0 && rows.length === 0 && !!text;
        const kind: FileKind = isProseDoc ? "school-docs" : detected.kind;
        // Map against the school's catalog for the detected kind (includes its
        // own EAV fields). School documents carry no columns to map.
        const mapping =
          kind === "school-docs"
            ? {}
            : buildMapping(headers, eavFieldsForKind(kind));
        // Reuse the school's saved mapping profile for this kind when its
        // headers still match — schools with consistent templates skip re-mapping.
        const profile = savedMappings?.find((m) => m.kind === kind);
        if (profile?.mapping) {
          for (const [key, header] of Object.entries(profile.mapping as Record<string, string>)) {
            if (headers.includes(header)) mapping[key] = header;
          }
        }
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  parseStatus: "ready",
                  headers,
                  rawRows: rows,
                  docText: text,
                  mapping,
                  kind,
                  autoKind: detected.autoKind,
                }
              : e
          )
        );
      } catch (err) {
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? { ...e, parseStatus: "error", parseError: err instanceof Error ? err.message : "Could not read file" }
              : e
          )
        );
      }
    }
  }

  function removeFile(id: string) {
    setQueue((q) => q.filter((e) => e.id !== id));
  }

  function setFileMapping(id: string, key: string, value: string) {
    setQueue((q) => q.map((e) => (e.id === id ? { ...e, mapping: { ...e.mapping, [key]: value } } : e)));
  }

  function setFileKind(id: string, kind: FileKind) {
    setQueue((q) =>
      q.map((e) => {
        if (e.id !== id) return e;
        // Re-map the file for the chosen kind so its fields (including that
        // kind's EAV fields) are fresh.
        const mapping =
          kind === "school-docs" ? {} : buildMapping(e.headers, eavFieldsForKind(kind));
        return { ...e, kind, mapping };
      })
    );
  }

  // ── AI-assisted column mapping ────────────────────────────────────
  // Send the file's headers + a sample of rows to the assistant, then apply
  // its suggested kind + mapping. The user still sees and can edit every
  // field in the Map Columns step afterwards. The catalog is server-driven so
  // the AI knows the school's own EAV fields (with their input type/options).
  const aiFieldCatalog = useMemo(() => {
    if (!importCatalog) return [];
    return (Object.keys(importCatalog) as Exclude<FileKind, "school-docs">[]).flatMap((kind) => {
      const entry = importCatalog[kind];
      return [
        ...entry.systemFields.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          inputType: f.inputType,
          options: f.options,
        })),
        ...entry.eavFields.map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          inputType: f.inputType,
          options: f.options,
        })),
      ];
    });
  }, [importCatalog]);

  async function analyzeFileWithAI(entry: FileEntry) {
    if (!school) return;
    if (aiAnalyzingId) return;
    setAiAnalyzingId(entry.id);
    try {
      const result = await aiSuggestMapping({
        schoolId: school._id,
        fileName: entry.fileName,
        headers: entry.headers,
        sampleRows: entry.rawRows.slice(0, 5),
        fieldCatalog: aiFieldCatalog,
        // Documents aren't a valid target kind for the AI mapper.
        currentKind: entry.kind === "school-docs" ? "students" : entry.kind,
      });
      const suggestedKind = result.kind as FileKind;
      setQueue((q) =>
        q.map((e) =>
          e.id === entry.id
            ? { ...e, kind: suggestedKind, mapping: result.mapping }
            : e
        )
      );
      setAiNotes((n) => ({ ...n, [entry.id]: result.notes }));
      toast.success(
        `AI mapped ${entry.fileName} as ${KIND_LABELS[suggestedKind]} — review below then continue.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAiAnalyzingId(null);
    }
  }

  // ── Per-file previews (recomputed when mapping/kind change) ────────
  const filePreviews: FilePreview[] = useMemo(() => {
    return readyFiles.map((entry) => {
      const studentRows: MappedStudentRow[] = [];
      const staffRows: MappedStaffRow[] = [];
      const feeRows: MappedFeeRow[] = [];
      const attendanceRows: MappedAttendanceRow[] = [];
      const feePaymentRows: MappedFeePaymentRow[] = [];
      const subjectRows: MappedSubjectRow[] = [];
      const classRows: MappedClassRow[] = [];
      const termRows: MappedTermRow[] = [];
      let issues: Issue[] = [];

      if (entry.kind === "school-docs") {
        issues = [];
      } else if (entry.kind === "attendance") {
        entry.rawRows.forEach((raw) => {
          const att = buildAttendanceRow(raw, entry.mapping);
          if (att) attendanceRows.push(att);
        });
        issues = buildAttendanceIssues(attendanceRows);
      } else if (entry.kind === "fee-payments") {
        entry.rawRows.forEach((raw) => {
          const fp = buildFeePaymentRow(raw, entry.mapping);
          if (fp) feePaymentRows.push(fp);
        });
        issues = buildFeePaymentIssues(feePaymentRows, existingAdmNos);
      } else if (entry.kind === "subjects") {
        entry.rawRows.forEach((raw, i) => {
          const subj = buildSubjectRow(raw, entry.mapping, i);
          if (subj) subjectRows.push(subj);
        });
        issues = buildSubjectIssues(subjectRows);
      } else if (entry.kind === "classes") {
        entry.rawRows.forEach((raw) => {
          const cls = buildClassRow(raw, entry.mapping);
          if (cls) classRows.push(cls);
        });
        issues = buildClassIssues(classRows, classNames);
      } else if (entry.kind === "terms") {
        entry.rawRows.forEach((raw) => {
          const term = buildTermRow(raw, entry.mapping);
          if (term) termRows.push(term);
        });
        issues = buildTermIssues(termRows);
      } else if (entry.kind === "fees") {
        entry.rawRows.forEach((raw) => {
          const fee = buildFeeRow(raw, entry.mapping);
          if (fee) feeRows.push(fee);
        });
        issues = buildFeeIssues(feeRows, classRefs, streamRefs, studentRefs, createMissingClasses);
      } else if (entry.kind === "staff") {
        entry.rawRows.forEach((raw, i) => {
          const role = cellToString(entry.mapping.role ? raw[entry.mapping.role] : "");
          staffRows.push(
            buildStaffRow(raw, entry.mapping, i, classifyStaffCategory(role), staffEavKeys)
          );
        });
        issues = buildStaffIssues(staffRows);
      } else {
        entry.rawRows.forEach((raw, i) => {
          const name =
            cellToString(entry.mapping.fullName ? raw[entry.mapping.fullName] : "") ||
            [cellToString(entry.mapping.firstName ? raw[entry.mapping.firstName] : ""), cellToString(entry.mapping.lastName ? raw[entry.mapping.lastName] : "")].join(" ");
          const className = cellToString(entry.mapping.className ? raw[entry.mapping.className] : "");
          const staffNo = cellToString(entry.mapping.staffNo ? raw[entry.mapping.staffNo] : "");
          const role = cellToString(entry.mapping.role ? raw[entry.mapping.role] : "");

          if ((staffNo && !className) || (!className && HONORIFIC_RE.test(name)) || (!className && role && NON_TEACHING_ROLE_RE.test(role))) {
            staffRows.push(
              buildStaffRow(raw, entry.mapping, staffRows.length, classifyStaffCategory(role), staffEavKeys)
            );
          } else {
            studentRows.push(buildStudentRow(raw, entry.mapping, studentRows.length));
          }
        });
        issues = [
          ...buildStudentIssues(studentRows, existingAdmNos, classNames, createMissingClasses),
          ...buildStaffIssues(staffRows),
        ];
      }

      const errorCount = issues.filter((i) => i.type === "error").length;
      const warnCount = issues.filter((i) => i.type === "warn").length;
      return {
        entry,
        kind: entry.kind,
        studentRows,
        staffRows,
        feeRows,
        attendanceRows,
        feePaymentRows,
        subjectRows,
        classRows,
        termRows,
        issues,
        errorCount,
        warnCount,
      };
    });
  }, [readyFiles, existingAdmNos, classNames, createMissingClasses, staffEavKeys]);

  // ── Phase 2.2: smart duplicate detection ───────────────────────────
  // Server-side multi-key matching (admNo, name+DOB, name+class for
  // students; staffNo/email/phone/name for staff). Global row indexes map
  // back to (file, row) for the per-row resolution UI.
  const allStudentRows = useMemo(() => filePreviews.flatMap((f) => f.studentRows), [filePreviews]);
  const allStaffRows = useMemo(() => filePreviews.flatMap((f) => f.staffRows), [filePreviews]);
  // Safety cap on the reactive query payload — the server matches against
  // up to 2000 existing records, and the visible preview covers ~20 rows, so
  // rows beyond this slice simply default to their per-row action.
  const duplicateMatches = useQuery(
    api.imports.detectDuplicates,
    school && allStudentRows.length + allStaffRows.length > 0
      ? {
          schoolId: school._id,
          rows: allStudentRows.slice(0, 5000),
          staffRows: allStaffRows.slice(0, 5000),
        }
      : "skip"
  );
  const rowGlobalIndex = useMemo(() => {
    const map: Record<string, number> = {};
    let s = 0;
    for (const f of filePreviews) {
      for (let i = 0; i < f.studentRows.length; i++) {
        map[`${f.entry.id}:s:${i}`] = s++;
      }
    }
    let t = 0;
    for (const f of filePreviews) {
      for (let i = 0; i < f.staffRows.length; i++) {
        map[`${f.entry.id}:t:${i}`] = t++;
      }
    }
    return map;
  }, [filePreviews]);

  const studentMatchFor = useCallback(
    (fileId: string, rowIndex: number): StudentRowMatch | undefined => {
      const g = rowGlobalIndex[`${fileId}:s:${rowIndex}`];
      return g === undefined ? undefined : duplicateMatches?.students.find((m) => m.index === g);
    },
    [rowGlobalIndex, duplicateMatches]
  );
  const staffMatchFor = useCallback(
    (fileId: string, rowIndex: number): StaffRowMatch | undefined => {
      const g = rowGlobalIndex[`${fileId}:t:${rowIndex}`];
      return g === undefined ? undefined : duplicateMatches?.staff.find((m) => m.index === g);
    },
    [rowGlobalIndex, duplicateMatches]
  );

  const defaultAction = (match?: { status: "new" | "duplicate" | "conflicting" }): RowResolution =>
    match && match.status !== "new" ? "skip" : "create";
  const actionFor = (
    fileId: string,
    rowIndex: number,
    prefix: "s" | "t",
    match?: { status: "new" | "duplicate" | "conflicting" }
  ): RowResolution => resolutions[`${fileId}:${prefix}:${rowIndex}`] ?? defaultAction(match);

  function setRowResolution(fileId: string, rowIndex: number, prefix: "s" | "t", action: RowResolution) {
    setResolutions((r) => ({ ...r, [`${fileId}:${prefix}:${rowIndex}`]: action }));
  }

  function setAllRowResolutions(
    fileId: string,
    prefix: "s" | "t",
    action: RowResolution,
    count: number,
    isMatched: (i: number) => boolean
  ) {
    setResolutions((r) => {
      const next = { ...r };
      for (let i = 0; i < count; i++) {
        if (isMatched(i)) next[`${fileId}:${prefix}:${i}`] = action;
      }
      return next;
    });
  }

  // Summary counts of detected matches across all files (for the review badges).
  const dupCounts = useMemo(() => {
    const counts = { new: 0, duplicate: 0, conflicting: 0 };
    if (!duplicateMatches) return counts;
    for (const m of duplicateMatches.students) counts[m.status]++;
    for (const m of duplicateMatches.staff) counts[m.status]++;
    return counts;
  }, [duplicateMatches]);

  const totalStudents = useMemo(() => filePreviews.reduce((n, f) => n + f.studentRows.length, 0), [filePreviews]);
  const totalStaff = useMemo(() => filePreviews.reduce((n, f) => n + f.staffRows.length, 0), [filePreviews]);
  const totalFees = useMemo(() => filePreviews.reduce((n, f) => n + f.feeRows.length, 0), [filePreviews]);
  const totalAttendance = useMemo(() => filePreviews.reduce((n, f) => n + f.attendanceRows.length, 0), [filePreviews]);
  const totalFeePayments = useMemo(() => filePreviews.reduce((n, f) => n + f.feePaymentRows.length, 0), [filePreviews]);
  const totalSubjects = useMemo(() => filePreviews.reduce((n, f) => n + f.subjectRows.length, 0), [filePreviews]);
  const totalClasses = useMemo(() => filePreviews.reduce((n, f) => n + f.classRows.length, 0), [filePreviews]);
  const totalTerms = useMemo(() => filePreviews.reduce((n, f) => n + f.termRows.length, 0), [filePreviews]);
  const totalSchoolDocs = useMemo(() => filePreviews.filter((f) => f.kind === "school-docs").length, [filePreviews]);
  const totalRows =
    totalStudents +
    totalStaff +
    totalFees +
    totalAttendance +
    totalFeePayments +
    totalSubjects +
    totalClasses +
    totalTerms;
  const totalErrors = useMemo(() => filePreviews.reduce((n, f) => n + f.errorCount, 0), [filePreviews]);
  const totalWarnings = useMemo(() => filePreviews.reduce((n, f) => n + f.warnCount, 0), [filePreviews]);

  // ── Cross-referenced aggregation (manual onboarding + files + existing DB)
  // Fee rows that come from an actual fee-schedule file.
  const fileFeeRows = useMemo(() => filePreviews.flatMap((f) => f.feeRows), [filePreviews]);
  // Class names referenced anywhere in the uploaded files.
  const fileClassNames = useMemo(() => {
    const names = new Set<string>();
    filePreviews.forEach((f) => {
      f.studentRows.forEach((r) => {
        if (r.className.trim()) names.add(r.className.trim());
      });
      f.feeRows.forEach((r) => {
        if (r.className.trim()) names.add(r.className.trim());
      });
    });
    return [...names];
  }, [filePreviews]);

  // Manual "fee per student" from onboarding acts as a default structure when
  // no fee-schedule file was uploaded. Classes resolve from the files first,
  // falling back to what the tool already has. Nothing is invented — the fee
  // must come from a real source (a file or the principal's manual answer).
  const manualFeeRows = useMemo(() => {
    if (fileFeeRows.length > 0) return [];
    const amount = parseAmount(onboarding?.feePerStudent);
    if (amount === undefined) return [];
    const classList =
      fileClassNames.length > 0
        ? fileClassNames
        : (classes ?? []).map((c) => c.name).filter((n) => n.trim());
    const seen = new Set<string>();
    const rows: MappedFeeRow[] = [];
    for (const cn of classList) {
      const key = cn.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ className: cn.trim(), amount });
    }
    return rows;
  }, [fileFeeRows, fileClassNames, onboarding?.feePerStudent, classes]);

  const totalFeesWithManual = totalFees + manualFeeRows.length;

  // Students whose rows carry guardian contact — these become Guardian
  // records linked to the student (deduped server-side by phone/email).
  const totalGuardians = useMemo(
    () =>
      filePreviews.reduce(
        (n, f) =>
          n +
          f.studentRows.filter(
            (r) => r.guardianName && (r.guardianPhone || r.guardianEmail)
          ).length,
        0
      ),
    [filePreviews]
  );

  // ── Run import (sequential, per file) ─────────────────────────────
  async function handleRun() {
    if (!school) return;
    if (readyFiles.length === 0) return;
    setRunning(true);
    setReport(null);

    // Phase 17C: auto-save the column mapping of every file that imports
    // cleanly as a reusable profile for that kind (next upload of the same
    // kind starts from it). Best-effort — never fails the import.
    const successfulMappings: { kind: ImportKindKey; mapping: Record<string, string> }[] = [];
    const recordSuccess = (entry: FileEntry) => {
      if (entry.kind === "school-docs") return;
      const mapping: Record<string, string> = {};
      for (const [key, value] of Object.entries(entry.mapping)) {
        if (value && value.trim() !== "") mapping[key] = value;
      }
      if (Object.keys(mapping).length > 0) {
        successfulMappings.push({ kind: entry.kind as ImportKindKey, mapping });
      }
    };

    const allErrors: { file: string; row: number; reason: string }[] = [];
    const createdClasses = new Set<string>();
    const createdStreams = new Set<string>();
    let studentsCreated = 0;
    let studentsSkipped = 0;
    let studentsOverwritten = 0;
    let staffCreated = 0;
    let staffOverwritten = 0;
    let staffTeaching = 0;
    let staffNonTeaching = 0;
    let guardiansCreated = 0;
    let guardianLinksCreated = 0;
    let structuresCreated = 0;
    let attendanceCreated = 0;
    let feePaymentsCreated = 0;
    let subjectsCreated = 0;
    let classesCreated = 0;
    let streamsCreated = 0;
    let termsCreated = 0;
    let schoolDocsRecognized = 0;
    let failedFiles = 0;
    let termCreated: { name: string; year: number } | null = null;
    let firstFeeCarrierSeen = false;

    // Process files in a dependency-safe order regardless of upload order:
    // terms → classes → students → staff → fees → payments → subjects →
    // attendance. This is what lets a fee file resolve "Grade 1 A" against the
    // classes/streams/students the students file just created.
    const IMPORT_ORDER: Record<string, number> = {
      terms: 0,
      classes: 1,
      students: 2,
      staff: 3,
      fees: 4,
      "fee-payments": 5,
      subjects: 6,
      attendance: 7,
    };
    const orderedFiles = [...readyFiles].sort(
      (a, b) => (IMPORT_ORDER[a.kind] ?? 99) - (IMPORT_ORDER[b.kind] ?? 99)
    );

    for (let i = 0; i < orderedFiles.length; i++) {
      const entry = orderedFiles[i];
      setCurrentFileIndex(i + 1);
      setQueue((q) =>
        q.map((e) => (e.id === entry.id ? { ...e, importStatus: "importing" } : e))
      );

      const preview = filePreviews.find((f) => f.entry.id === entry.id);
      // Cross-referenced manual fee default rides along with the first
      // students/staff/fees file — it is only generated when no fee file
      // exists, so it can't collide with a file that already carries its own
      // fee rows. Files that `continue` earlier (terms, attendance, ...) are
      // skipped so the manual rows never ride on a dead-end file.
      const isFirstFeeCarrier =
        !firstFeeCarrierSeen && (entry.kind === "students" || entry.kind === "staff" || entry.kind === "fees");
      if (isFirstFeeCarrier) firstFeeCarrierSeen = true;
      const isFirstFile = isFirstFeeCarrier;
      const feeRowsForFile = preview
        ? [...preview.feeRows, ...(isFirstFile ? manualFeeRows : [])]
        : isFirstFile
          ? manualFeeRows
          : [];

      // ── School documents (PDF/DOCX prose): recognized and filed — they
      // carry no rows to import, so they're marked done with a note.
      if (entry.kind === "school-docs") {
        schoolDocsRecognized++;
        const docReport: FileImportResult = { schoolDocs: { recognized: 1 } };
        setQueue((q) =>
          q.map((e) => (e.id === entry.id ? { ...e, importStatus: "done", report: docReport } : e))
        );
        continue;
      }

      // ── Fee payments / balances: resolved by admission number (or full
      // name against existing students), written to fee_payments for the
      // active term. Unknown students are reported back per row.
      if (entry.kind === "fee-payments") {
        const fpRows = preview?.feePaymentRows ?? [];
        const nameToAdm = new Map<string, string>();
        (students ?? []).forEach((s) => {
          const key = `${s.firstName} ${s.lastName}`.toLowerCase().replace(/\s+/g, " ").trim();
          if (key && !nameToAdm.has(key)) nameToAdm.set(key, s.admNo);
        });
        // Resolve names to admission numbers against existing students.
        // Rows we can't resolve are REPORTED as errors — never silently
        // dropped from the import report.
        const unresolved: { row: number; name: string }[] = [];
        const resolvable: MappedFeePaymentRow[] = [];
        fpRows.forEach((r, idx) => {
          const nameKey2 = r.studentName.toLowerCase().replace(/\s+/g, " ").trim();
          const admNo = r.admNo || nameToAdm.get(nameKey2) || "";
          const trimmed = admNo.trim().toLowerCase();
          if (!trimmed || trimmed.startsWith("auto-")) {
            unresolved.push({ row: idx + 2, name: r.studentName || r.admNo || "(no name)" });
          } else {
            resolvable.push({ ...r, admNo });
          }
        });
        const fpChunks = chunkRows(resolvable, IMPORT_CALL_ROWS);
        let fpOk = true;
        let fpCreated = 0;
        let lastFpError: string | undefined;
        const fpErrors: { row: number; reason: string }[] = unresolved.map((u) => ({
          row: u.row,
          reason: `No student found for "${u.name}" — check the name or admission number`,
        }));
        fpErrors.forEach((e) => allErrors.push({ file: entry.fileName, row: e.row, reason: e.reason }));
        for (let c = 0; c < fpChunks.length; c++) {
          const chunk = fpChunks[c]!;
          const start = c * IMPORT_CALL_ROWS;
          try {
            const res = await importFeePayments({
              schoolId: school._id,
              rows: chunk.map((r) => ({
                admNo: r.admNo,
                amount: r.amount,
                method: r.method,
                date: r.date,
                reference: r.reference,
                termName: r.termName,
                termYear: r.termYear,
              })),
            });
            fpCreated += res.created;
            fpErrors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
            allErrors.push(
              ...res.errors.map((e) => ({ file: entry.fileName, row: e.row + start, reason: e.reason }))
            );
          } catch (err) {
            fpOk = false;
            failedFiles++;
            lastFpError = err instanceof Error ? err.message : "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastFpError });
            break;
          }
        }
        feePaymentsCreated += fpCreated;
        const fpReport: FileImportResult = { feePayments: { created: fpCreated, errors: fpErrors } };
        if (fpOk) recordSuccess(entry);
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? fpOk
                ? { ...e, importStatus: "done", report: fpReport }
                : { ...e, importStatus: "error", importError: lastFpError ?? "Import failed" }
              : e
          )
        );
        continue;
      }

      // ── Subjects catalog: bulk-create subjects (deduped by name).
      if (entry.kind === "subjects") {
        const subjRows = preview?.subjectRows ?? [];
        const subjChunks = chunkRows(subjRows, IMPORT_CALL_ROWS);
        let subjOk = true;
        let subjCreated = 0;
        let subjSkipped = 0;
        let lastSubjError: string | undefined;
        const subjErrors: { row: number; reason: string }[] = [];
        for (let c = 0; c < subjChunks.length; c++) {
          const chunk = subjChunks[c]!;
          const start = c * IMPORT_CALL_ROWS;
          try {
            const res = await importSubjects({
              schoolId: school._id,
              rows: chunk.map((r) => ({ name: r.name, code: r.code, level: r.level ?? "general" })),
            });
            subjCreated += res.created;
            subjSkipped += res.skipped;
            subjErrors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
            allErrors.push(
              ...res.errors.map((e) => ({ file: entry.fileName, row: e.row + start, reason: e.reason }))
            );
          } catch (err) {
            subjOk = false;
            failedFiles++;
            lastSubjError = err instanceof Error ? err.message : "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastSubjError });
            break;
          }
        }
        subjectsCreated += subjCreated;
        const subjReport: FileImportResult = {
          subjects: { created: subjCreated, skipped: subjSkipped, errors: subjErrors },
        };
        if (subjOk) recordSuccess(entry);
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? subjOk
                ? { ...e, importStatus: "done", report: subjReport }
                : { ...e, importStatus: "error", importError: lastSubjError ?? "Import failed" }
              : e
          )
        );
        continue;
      }

      // ── Classes & streams: bulk-create the class structure.
      if (entry.kind === "classes") {
        const clsRows = preview?.classRows ?? [];
        const clsChunks = chunkRows(clsRows, IMPORT_CALL_ROWS);
        let clsOk = true;
        let clsCreated = 0;
        let strmCreated = 0;
        let clsSkipped = 0;
        let lastClsError: string | undefined;
        const clsErrors: { row: number; reason: string }[] = [];
        for (let c = 0; c < clsChunks.length; c++) {
          const chunk = clsChunks[c]!;
          const start = c * IMPORT_CALL_ROWS;
          try {
            const res = await importClasses({
              schoolId: school._id,
              rows: chunk.map((r) => ({ className: r.className, streamName: r.streamName })),
            });
            clsCreated += res.classesCreated;
            strmCreated += res.streamsCreated;
            clsSkipped += res.skipped;
            clsErrors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
            allErrors.push(
              ...res.errors.map((e) => ({ file: entry.fileName, row: e.row + start, reason: e.reason }))
            );
          } catch (err) {
            clsOk = false;
            failedFiles++;
            lastClsError = err instanceof Error ? err.message : "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastClsError });
            break;
          }
        }
        classesCreated += clsCreated;
        streamsCreated += strmCreated;
        const clsReport: FileImportResult = {
          classes: {
            classesCreated: clsCreated,
            streamsCreated: strmCreated,
            skipped: clsSkipped,
            errors: clsErrors,
          },
        };
        if (clsOk) recordSuccess(entry);
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? clsOk
                ? { ...e, importStatus: "done", report: clsReport }
                : { ...e, importStatus: "error", importError: lastClsError ?? "Import failed" }
              : e
          )
        );
        continue;
      }

      // ── Terms schedule: bulk-create terms (academic year auto-created).
      if (entry.kind === "terms") {
        const termRows2 = preview?.termRows ?? [];
        const termChunks = chunkRows(termRows2, IMPORT_CALL_ROWS);
        let termOk = true;
        let termCreatedCount = 0;
        let lastTermError: string | undefined;
        const termErrors: { row: number; reason: string }[] = [];
        for (let c = 0; c < termChunks.length; c++) {
          const chunk = termChunks[c]!;
          const start = c * IMPORT_CALL_ROWS;
          try {
            const res = await importTerms({
              schoolId: school._id,
              rows: chunk.map((r) => ({
                name: r.name,
                year: r.year,
                startDate: r.startDate ?? Date.now(),
                endDate: r.endDate ?? Date.now() + 90 * 24 * 60 * 60 * 1000,
              })),
            });
            termCreatedCount += res.termsCreated;
            termErrors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
            allErrors.push(
              ...res.errors.map((e) => ({ file: entry.fileName, row: e.row + start, reason: e.reason }))
            );
          } catch (err) {
            termOk = false;
            failedFiles++;
            lastTermError = err instanceof Error ? err.message : "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastTermError });
            break;
          }
        }
        termsCreated += termCreatedCount;
        const termReport: FileImportResult = { terms: { termsCreated: termCreatedCount, academicYearsCreated: 0, skipped: 0, errors: termErrors } };
        if (termOk) recordSuccess(entry);
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? termOk
                ? { ...e, importStatus: "done", report: termReport }
                : { ...e, importStatus: "error", importError: lastTermError ?? "Import failed" }
              : e
          )
        );
        continue;
      }

      // ── Attendance files: matched by admission number, inserted as
      // period_attendance records — no student/staff/fee payload involved.
      if (entry.kind === "attendance") {
        const attRows = preview?.attendanceRows ?? [];
        const attChunks = chunkRows(attRows, IMPORT_CALL_ROWS);
        const defaultDate = attRows.find((r) => r.date)?.date ?? Date.now();
        let attOk = true;
        let attCreated = 0;
        let lastAttError: string | undefined;
        const attErrors: { row: number; reason: string }[] = [];
        for (let c = 0; c < attChunks.length; c++) {
          const chunk = attChunks[c]!;
          const start = c * IMPORT_CALL_ROWS;
          const date = chunk.find((r) => r.date)?.date ?? defaultDate;
          const period = chunk.find((r) => r.period !== undefined)?.period;
          try {
            const res = await importAttendance({
              schoolId: school._id,
              date,
              periodNumber: period,
              records: chunk.map((r) => ({ admNo: r.admNo, status: r.status })),
            });
            attCreated += res.created;
            attErrors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
            allErrors.push(
              ...res.errors.map((e) => ({ file: entry.fileName, row: e.row + start, reason: e.reason }))
            );
          } catch (err) {
            attOk = false;
            failedFiles++;
            lastAttError = err instanceof Error ? err.message : "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastAttError });
            break;
          }
        }
        attendanceCreated += attCreated;
        const attReport: FileImportResult = { attendance: { created: attCreated, errors: attErrors } };
        if (attOk) recordSuccess(entry);
        setQueue((q) =>
          q.map((e) =>
            e.id === entry.id
              ? attOk
                ? { ...e, importStatus: "done", report: attReport }
                : { ...e, importStatus: "error", importError: lastAttError ?? "Import failed" }
              : e
          )
        );
        continue;
      }

      // Split the file's rows into per-call batches so a file of any size
      // imports in one go — each `importBatch` call stays well inside Convex's
      // argument/array limits, and the server-side chunker handles the rest.
      const studentChunks = chunkRows(preview?.studentRows ?? [], IMPORT_CALL_ROWS);
      const staffChunks = chunkRows(preview?.staffRows ?? [], IMPORT_CALL_ROWS);
      const feeChunks = chunkRows(feeRowsForFile, IMPORT_CALL_ROWS);
      const callCount = Math.max(1, studentChunks.length, staffChunks.length, feeChunks.length);

      // Aggregated per-file result shown in the review step.
      let mergedStudents: FileImportResult["students"] | undefined;
      let mergedStaff: FileImportResult["staff"] | undefined;
      let mergedFees: FileImportResult["fees"] | undefined;
      let fileOk = true;
      let lastFileError: string | undefined;

      for (let c = 0; c < callCount; c++) {
        const studentRows = studentChunks[c] ?? [];
        const staffRows = staffChunks[c] ?? [];
        const feeRows = feeChunks[c] ?? [];
        if (studentRows.length === 0 && staffRows.length === 0 && feeRows.length === 0) continue;

        const studentStart = c * IMPORT_CALL_ROWS;
        const staffStart = c * IMPORT_CALL_ROWS;
        const feeStart = c * IMPORT_CALL_ROWS;
        // Phase 17C: EAV field defs for this file, derived from the mapped
        // "eav:" keys against the catalog. Staff files write staff-bucket EAV;
        // student files write learner-bucket EAV (staff rows mixed into a
        // students file carry no staff EAV because their values were filtered).
        // This code path only runs for students/staff/fees files (all other
        // kinds `continue` earlier), so `importCatalog` is always the right
        // catalog for the file's kind.
        const catalogEntry = importCatalog?.[entry.kind];
        const eavDefs: { key: string; fieldId: Id<"fields">; bucket?: string }[] = [];
        if (catalogEntry) {
          for (const key of Object.keys(entry.mapping)) {
            if (!key.startsWith("eav:")) continue;
            const f = catalogEntry.eavFields.find((x) => x.key === key);
            if (f?.fieldId) {
              eavDefs.push({ key, fieldId: f.fieldId as Id<"fields">, bucket: f.bucket });
            }
          }
        }
        const payload = {
          fileName: entry.fileName,
          kind: entry.kind,
          rows: studentRows,
          staffRows,
          feeRows,
          eavFields: entry.kind === "staff" ? [] : eavDefs,
          staffEavFields: entry.kind === "staff" ? eavDefs : [],
          studentResolutions: studentRows.map((_, j) => ({
            index: j,
            action: actionFor(entry.id, studentStart + j, "s", studentMatchFor(entry.id, studentStart + j)),
          })),
          staffResolutions: staffRows.map((_, j) => ({
            index: j,
            action: actionFor(entry.id, staffStart + j, "t", staffMatchFor(entry.id, staffStart + j)),
          })),
        };

        try {
          const res = await importBatch({
            schoolId: school._id,
            files: [payload],
            createMissingClasses,
            termName: onboarding?.currentTermName,
            termYear: onboarding?.currentTermYear,
          });
          const fileResult = res.files[0];
          if (fileResult.ok && fileResult.result) {
            const r = fileResult.result;
            if (r.students) {
              mergedStudents ??= {
                created: 0,
                skippedDuplicates: 0,
                overwritten: 0,
                guardiansCreated: 0,
                guardianLinksCreated: 0,
                errors: [],
                createdClasses: [],
                createdStreams: [],
                rowResults: [],
              };
              mergedStudents.created += r.students.created;
              mergedStudents.skippedDuplicates += r.students.skippedDuplicates;
              mergedStudents.overwritten += r.students.overwritten;
              mergedStudents.guardiansCreated += r.students.guardiansCreated;
              mergedStudents.guardianLinksCreated += r.students.guardianLinksCreated;
              mergedStudents.createdClasses.push(...r.students.createdClasses);
              mergedStudents.createdStreams.push(...r.students.createdStreams);
              mergedStudents.errors.push(
                ...r.students.errors.map((e) => ({ row: e.row + studentStart, reason: e.reason }))
              );
              mergedStudents.rowResults.push(
                ...r.students.rowResults.map((rr) => ({ ...rr, row: rr.row + studentStart }))
              );

              studentsCreated += r.students.created;
              studentsSkipped += r.students.skippedDuplicates;
              studentsOverwritten += r.students.overwritten;
              guardiansCreated += r.students.guardiansCreated;
              guardianLinksCreated += r.students.guardianLinksCreated;
              r.students.createdClasses.forEach((cname) => createdClasses.add(cname));
              r.students.createdStreams.forEach((sname) => createdStreams.add(sname));
              allErrors.push(
                ...r.students.errors.map((e) => ({ file: entry.fileName, row: e.row + studentStart, reason: e.reason }))
              );
            }
            if (r.staff) {
              mergedStaff ??= {
                created: 0,
                skipped: 0,
                overwritten: 0,
                teaching: 0,
                nonTeaching: 0,
                errors: [],
                rowResults: [],
              };
              mergedStaff.created += r.staff.created;
              mergedStaff.skipped += r.staff.skipped;
              mergedStaff.overwritten += r.staff.overwritten;
              mergedStaff.teaching += r.staff.teaching;
              mergedStaff.nonTeaching += r.staff.nonTeaching;
              mergedStaff.errors.push(
                ...r.staff.errors.map((e) => ({ row: e.row + staffStart, reason: e.reason }))
              );
              mergedStaff.rowResults.push(
                ...r.staff.rowResults.map((rr) => ({ ...rr, row: rr.row + staffStart }))
              );

              staffCreated += r.staff.created;
              staffOverwritten += r.staff.overwritten;
              staffTeaching += r.staff.teaching;
              staffNonTeaching += r.staff.nonTeaching;
              allErrors.push(
                ...r.staff.errors.map((e) => ({ file: entry.fileName, row: e.row + staffStart, reason: e.reason }))
              );
            }
            if (r.fees) {
              mergedFees ??= { structuresCreated: 0, errors: [], createdTerm: false, resolutions: [] };
              mergedFees.structuresCreated += r.fees.structuresCreated;
              mergedFees.errors.push(
                ...r.fees.errors.map((e) => ({ row: e.row + feeStart, reason: e.reason }))
              );
              mergedFees.createdTerm = mergedFees.createdTerm || r.fees.createdTerm;
              if (r.fees.termName) mergedFees.termName = r.fees.termName;
              if (r.fees.termYear) mergedFees.termYear = r.fees.termYear;
              if (r.fees.resolutions) {
                mergedFees.resolutions!.push(
                  ...r.fees.resolutions.map((x) => ({ ...x, row: x.row + feeStart }))
                );
              }

              structuresCreated += r.fees.structuresCreated;
              allErrors.push(
                ...r.fees.errors.map((e) => ({ file: entry.fileName, row: e.row + feeStart, reason: e.reason }))
              );
              if (r.fees.createdTerm) {
                termCreated = { name: r.fees.termName ?? "Term 1", year: r.fees.termYear ?? new Date().getFullYear() };
              }
            }
          } else {
            fileOk = false;
            failedFiles++;
            lastFileError = fileResult.error ?? "Import failed";
            allErrors.push({ file: entry.fileName, row: 0, reason: lastFileError ?? "Import failed" });
            break;
          }
        } catch (err) {
          fileOk = false;
          failedFiles++;
          lastFileError = err instanceof Error ? err.message : "Import failed";
          allErrors.push({ file: entry.fileName, row: 0, reason: lastFileError ?? "Import failed" });
          break;
        }
      }

      const fileReport: FileImportResult = {};
      if (mergedStudents) fileReport.students = mergedStudents;
      if (mergedStaff) fileReport.staff = mergedStaff;
      if (mergedFees) fileReport.fees = mergedFees;
      if (fileOk) recordSuccess(entry);
      setQueue((q) =>
        q.map((e) =>
          e.id === entry.id
            ? fileOk
              ? { ...e, importStatus: "done", report: fileReport }
              : { ...e, importStatus: "error", importError: lastFileError ?? "Import failed" }
            : e
        )
      );
    }

    // Persist the mapping profiles for the files that imported successfully —
    // next upload of the same kind starts from these (best-effort, never fails
    // the import itself).
    if (school && successfulMappings.length > 0) {
      await Promise.allSettled(
        successfulMappings.map((m) =>
          saveMapping({ schoolId: school._id, kind: m.kind, mapping: m.mapping })
        )
      );
    }

    setReport({
      studentsCreated,
      studentsSkipped,
      studentsOverwritten,
      staffCreated,
      staffOverwritten,
      staffTeaching,
      staffNonTeaching,
      guardiansCreated,
      guardianLinksCreated,
      structuresCreated,
      attendanceCreated,
      feePaymentsCreated,
      subjectsCreated,
      classesCreated,
      streamsCreated,
      termsCreated,
      schoolDocsRecognized,
      manualFeeApplied: manualFeeRows.length > 0,
      manualFeeAmount: manualFeeRows[0]?.amount,
      manualFeeClassCount: manualFeeRows.length,
      createdClasses: [...createdClasses],
      createdStreams: [...createdStreams],
      errors: allErrors,
      failedFiles,
      termCreated,
    });
    setRunning(false);
    setCurrentFileIndex(0);
    setStep("done");
  }

  // ── Stepper header ────────────────────────────────────────────────
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map Columns" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];

  return (
    <Modal open={open} onClose={handleClose} title="Import School Data" size="lg">
      <div className="space-y-5">
        {/* Stepper */}
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  step === s.key
                    ? "bg-primary text-primary-foreground"
                    : step === "done" || steps.findIndex((x) => x.key === step) > i
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.label}
              </div>
              {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Upload (multi-file queue) ───────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Upload student lists, staff/teacher lists, fee schedules, or attendance registers
                (.csv or .xlsx). We auto-detect what each file contains and route it to the right
                section — teachers never land in Students. Files import one at a time.
              </p>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Student template
              </Button>
            </div>
            <label
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(Array.from(e.dataTransfer.files ?? []));
              }}
            >
              <FileSpreadsheet className="h-10 w-10 text-primary/60" />
              <div className="text-center">
                <p className="font-medium">Drop your files here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  CSV, Excel, PDF, Word, or images — select multiple files at once
                </p>
              </div>
              <Input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.webp"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) handleFiles(files);
                  e.target.value = "";
                }}
              />
            </label>

            {queue.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Files in queue ({queue.length})
                </p>
                {queue.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className="shrink-0">
                      {entry.parseStatus === "parsing" ? (
                        <BrandLoader variant="dots" size="sm" />
                      ) : entry.parseStatus === "ready" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : entry.parseStatus === "error" ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.fileName}</p>
                      {entry.parseStatus === "parsing" && (
                        <p className="text-xs text-muted-foreground">Reading file…</p>
                      )}
                      {entry.parseStatus === "ready" && (
                        <p className="text-xs text-muted-foreground">
                          {entry.rawRows.length} rows · detected as{" "}
                          {entry.autoKind && entry.autoKind !== entry.kind && KIND_GUIDES[entry.autoKind]
                            ? KIND_GUIDES[entry.autoKind].label
                            : KIND_LABELS[entry.kind]}
                        </p>
                      )}
                      {entry.parseStatus === "error" && (
                        <p className="text-xs text-red-600">{entry.parseError}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFile(entry.id)}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground cursor-pointer"
                      aria-label={`Remove ${entry.fileName}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-6 bg-background/90 backdrop-blur-sm z-10 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("map")}
                disabled={readyFiles.length === 0}
              >
                Next: Map Columns <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns (per file) ──────────────────── */}
        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm">
                We matched each file&apos;s columns automatically and detected what it contains. Fix
                anything wrong below — your data is never touched until you review it.
              </p>
            </div>

            {filePreviews.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No files ready.{" "}
                <button onClick={() => setStep("upload")} className="text-primary underline">
                  Add files
                </button>{" "}
                first.
              </p>
            )}

            {filePreviews.map(({ entry }) => {
              const fields = fieldsForKind(entry.kind);
              return (
                <div key={entry.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/5 border-b border-border">
                    <FileSpreadsheet className="h-4 w-4 text-primary/60 shrink-0" />
                    <p className="text-sm font-medium truncate">{entry.fileName}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {entry.rawRows.length} rows
                    </Badge>
                    {entry.kind !== "school-docs" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={() => analyzeFileWithAI(entry)}
                        disabled={aiAnalyzingId !== null}
                      >
                        {aiAnalyzingId === entry.id ? (
                          <BrandLoader variant="dots" size="sm" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                        )}
                        {aiAnalyzingId === entry.id ? "Analyzing…" : "AI Suggest Mapping"}
                      </Button>
                    )}
                  </div>
                  {aiNotes[entry.id] && (
                    <div className="px-3 py-2 border-b border-border bg-primary/5 flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">{aiNotes[entry.id]}</p>
                    </div>
                  )}
                  <div className="p-3 border-b border-border flex flex-wrap items-center gap-2 bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground">This file contains:</span>
                    <div className="flex gap-1.5">
                      {(["students", "staff", "fees", "attendance", "fee-payments", "subjects", "classes", "terms"] as FileKind[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => setFileKind(entry.id, k)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                            entry.kind === k
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {k === "students" && <Users className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "staff" && <User className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "fees" && <Coins className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "attendance" && <CalendarCheck className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "fee-payments" && <Coins className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "subjects" && <BookOpen className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "classes" && <School className="h-3.5 w-3.5 inline mr-1" />}
                          {k === "terms" && <CalendarDays className="h-3.5 w-3.5 inline mr-1" />}
                          {KIND_LABELS[k]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const auto = entry.autoKind;
                    if (!auto || auto === entry.kind) return null;
                    if (entry.kind === "school-docs") return null;
                    const guide = KIND_GUIDES[auto];
                    if (auto === "school-info" || auto === "logs" || auto === "unknown") {
                      return (
                        <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                          <p className="text-xs text-amber-800">
                            This file looks like {guide.label} — it belongs in the{" "}
                            <a
                              href={guide.href}
                              onClick={onClose}
                              className="font-semibold text-amber-900 underline"
                            >
                              {guide.label} section
                            </a>
                            , not an import list. {guide.note}.
                          </p>
                          <button
                            onClick={() => setFileKind(entry.id, "students")}
                            className="ml-auto text-xs font-semibold text-amber-900 underline cursor-pointer"
                          >
                            Import as students anyway
                          </button>
                        </div>
                      );
                    }
                    const importable = auto as FileKind;
                    return (
                      <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <p className="text-xs text-amber-800">
                          Detected as {KIND_LABELS[importable]} — import it there instead?
                        </p>
                        <button
                          onClick={() => setFileKind(entry.id, importable)}
                          className="ml-auto text-xs font-semibold text-amber-900 underline cursor-pointer"
                        >
                          Switch to {KIND_LABELS[importable]}
                        </button>
                      </div>
                    );
                  })()}
                  {entry.kind === "school-docs" ? (
                    <div className="p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Extracted text preview
                      </p>
                      <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto rounded-lg bg-secondary/5 border border-border p-3 text-muted-foreground font-sans">
                        {(entry.docText ?? "").slice(0, 2000)}
                        {(entry.docText?.length ?? 0) > 2000 ? "\n… (truncated preview)" : ""}
                      </pre>
                      <p className="text-[11px] text-muted-foreground">
                        This is a school document (policy / report / profile). It is recognized and filed under School
                        Profile — it contains no rows to import.
                      </p>
                    </div>
                  ) : (
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/5 sticky top-0">
                        <tr>
                          <th className="text-left p-2.5 font-medium">Field</th>
                          <th className="text-left p-2.5 font-medium">Your column</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field) => (
                          <tr key={field.key} className="border-t border-border">
                            <td className="p-2.5">
                              <span className="font-medium">{field.label}</span>
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                              {field.sectionName && (
                                <span className="block text-[11px] text-muted-foreground">
                                  {field.moduleName ? `${field.moduleName} · ` : ""}{field.sectionName}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              <Select
                                value={entry.mapping[field.key] ?? ""}
                                onChange={(e) => setFileMapping(entry.id, field.key, e.target.value)}
                                className="h-9"
                              >
                                <option value="">— Skip —</option>
                                {entry.headers.map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </Select>
                            </td>
                          </tr>
                        ))}
                        {entry.kind === "students" && (
                          <>
                            <tr className="border-t border-border">
                              <td className="p-2.5">
                                <span className="font-medium">Staff / TSC No</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  Used to spot teachers mixed into a student list
                                </span>
                              </td>
                              <td className="p-2.5">
                                <Select
                                  value={entry.mapping.staffNo ?? ""}
                                  onChange={(e) => setFileMapping(entry.id, "staffNo", e.target.value)}
                                  className="h-9"
                                >
                                  <option value="">— None —</option>
                                  {entry.headers.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </Select>
                              </td>
                            </tr>
                            <tr className="border-t border-border">
                              <td className="p-2.5">
                                <span className="font-medium">Role / Job Title</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  Marks staff as teaching vs non-teaching
                                </span>
                              </td>
                              <td className="p-2.5">
                                <Select
                                  value={entry.mapping.role ?? ""}
                                  onChange={(e) => setFileMapping(entry.id, "role", e.target.value)}
                                  className="h-9"
                                >
                                  <option value="">— None —</option>
                                  {entry.headers.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </Select>
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground px-1 pt-2">
                      Fields marked <span className="text-red-500">*</span> are required. Optional fields left as{" "}
                      <span className="font-medium">— Skip —</span> (e.g. Date of Birth, Admission date) are simply
                      left blank — they never block the import.
                    </p>
                  </div>
                  )}
                </div>
              );
            })}

            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-6 bg-background/90 backdrop-blur-sm z-10 border-t border-border flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-4 w-4 mr-2" /> Add more files
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("upload")}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={() => setStep("review")} disabled={filePreviews.length === 0}>
                  Next: Review <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Review + run (sequential) ──────────────── */}
        {step === "review" && (
          <div className="space-y-4">
            {running ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-secondary/5">
                  <BrandLoader variant="book" size="md" />
                  <div>
                    <p className="font-semibold">
                      Importing file {currentFileIndex} of {readyFiles.length}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Processing files one at a time — a failed file won&apos;t block the rest.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {readyFiles.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      <div className="shrink-0">
                        {entry.importStatus === "importing" ? (
                          <BrandLoader variant="dots" size="sm" />
                        ) : entry.importStatus === "done" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : entry.importStatus === "error" ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{entry.fileName}</p>
                      <span className="ml-auto text-xs text-muted-foreground capitalize">
                        {entry.importStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {totalStudents > 0 && <Badge variant="default">{totalStudents} students</Badge>}
                  {totalGuardians > 0 && <Badge variant="secondary">{totalGuardians} guardians</Badge>}
                  {totalStaff > 0 && <Badge variant="secondary">{totalStaff} staff</Badge>}
                  {totalFeesWithManual > 0 && <Badge variant="secondary">{totalFeesWithManual} fee structures</Badge>}
                  {totalFeePayments > 0 && <Badge variant="secondary">{totalFeePayments} fee payments</Badge>}
                  {totalSubjects > 0 && <Badge variant="secondary">{totalSubjects} subjects</Badge>}
                  {totalClasses > 0 && <Badge variant="secondary">{totalClasses} classes</Badge>}
                  {totalTerms > 0 && <Badge variant="secondary">{totalTerms} terms</Badge>}
                  {totalAttendance > 0 && <Badge variant="secondary">{totalAttendance} attendance records</Badge>}
                  {totalSchoolDocs > 0 && <Badge variant="secondary">{totalSchoolDocs} school document{totalSchoolDocs === 1 ? "" : "s"} recognized</Badge>}
                  {totalRows === 0 && totalSchoolDocs === 0 && <Badge variant="danger">No rows detected</Badge>}
                  {totalErrors > 0 && <Badge variant="danger">{totalErrors} issues</Badge>}
                  {totalWarnings > 0 && <Badge variant="warning">{totalWarnings} warnings</Badge>}
                  {dupCounts.duplicate > 0 && (
                    <Badge variant="warning">{dupCounts.duplicate} existing record{dupCounts.duplicate === 1 ? "" : "s"} matched</Badge>
                  )}
                  {dupCounts.conflicting > 0 && (
                    <Badge variant="danger">{dupCounts.conflicting} name conflict{dupCounts.conflicting === 1 ? "" : "s"}</Badge>
                  )}
                  {totalErrors === 0 && totalWarnings === 0 && totalRows > 0 && (
                    <Badge variant="success">Looks good — ready to import</Badge>
                  )}
                </div>

                <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-lg border border-border bg-secondary/5">
                  <input
                    type="checkbox"
                    checked={createMissingClasses}
                    onChange={(e) => setCreateMissingClasses(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Create classes/streams that don&apos;t exist yet</span>
                    <span className="block text-xs text-muted-foreground">
                      Needed for new student classes and fee schedules. Only rows for classes we can&apos;t find are affected.
                    </span>
                  </span>
                </label>

                {manualFeeRows.length > 0 && (
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <Coins className="h-4 w-4 text-primary" />
                      Applying your onboarding fee of {manualFeeRows[0].amount.toLocaleString()} to {manualFeeRows.length} class{manualFeeRows.length === 1 ? "" : "es"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No fee-schedule file was detected, so the fee you entered during Setup is cross-referenced and used as a default for every class found in your files.
                    </p>
                  </div>
                )}

                {totalWarnings > 0 && (
                  <div className="text-xs text-muted-foreground">
                    New classes/streams that will be created:{" "}
                    <span className="font-medium text-foreground">
                      {[...new Set(
                        [
                          ...manualFeeRows.map((f) => ({ className: f.className, streamName: f.streamName })),
                          ...filePreviews.flatMap(({ studentRows, feeRows }) =>
                            [...studentRows, ...feeRows.map((f) => ({ className: f.className, streamName: f.streamName }))]
                              .filter((r) => r.className && !classNames.has(r.className.toLowerCase().trim()))
                              .map((r) => `${r.className}${r.streamName ? ` / ${r.streamName}` : ""}`)
                          )
                        ]
                      )].join(", ") || "—"}
                    </span>
                  </div>
                )}

                {filePreviews.map(({ entry, studentRows, staffRows, feeRows, attendanceRows, feePaymentRows, subjectRows, classRows, termRows, issues }) => (
                  <div key={entry.id} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/5 border-b border-border">
                      <FileSpreadsheet className="h-4 w-4 text-primary/60 shrink-0" />
                      <p className="text-sm font-medium truncate">{entry.fileName}</p>
                      <div className="ml-auto flex gap-1.5">
                        {entry.kind === "staff" && staffRows.length > 0 && (
                          <Badge variant="secondary">{staffRows.length} staff</Badge>
                        )}
                        {entry.kind === "fees" && feeRows.length > 0 && (
                          <Badge variant="secondary">{feeRows.length} fee rows</Badge>
                        )}
                        {entry.kind === "attendance" && attendanceRows.length > 0 && (
                          <Badge variant="secondary">{attendanceRows.length} attendance records</Badge>
                        )}
                        {entry.kind === "fee-payments" && feePaymentRows.length > 0 && (
                          <Badge variant="secondary">{feePaymentRows.length} fee payments</Badge>
                        )}
                        {entry.kind === "subjects" && subjectRows.length > 0 && (
                          <Badge variant="secondary">{subjectRows.length} subjects</Badge>
                        )}
                        {entry.kind === "classes" && classRows.length > 0 && (
                          <Badge variant="secondary">{classRows.length} classes</Badge>
                        )}
                        {entry.kind === "terms" && termRows.length > 0 && (
                          <Badge variant="secondary">{termRows.length} terms</Badge>
                        )}
                        {entry.kind === "school-docs" && (
                          <Badge variant="secondary">School document</Badge>
                        )}
                        {entry.kind === "students" && studentRows.length > 0 && (
                          <Badge variant="default">{studentRows.length} students</Badge>
                        )}
                        {entry.kind === "students" && staffRows.length > 0 && (
                          <Badge variant="warning">{staffRows.length} staff found</Badge>
                        )}
                        {issues.filter((i) => i.type === "error").length > 0 && (
                          <Badge variant="danger">
                            {issues.filter((i) => i.type === "error").length} issues
                          </Badge>
                        )}
                        {issues.filter((i) => i.type === "warn").length > 0 && (
                          <Badge variant="warning">
                            {issues.filter((i) => i.type === "warn").length} warnings
                          </Badge>
                        )}
                      </div>
                    </div>
                    {(entry.kind === "students" || entry.kind === "staff") && (
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
                        <span className="text-xs font-medium text-muted-foreground">Existing matches:</span>
                        <button
                          onClick={() =>
                            setAllRowResolutions(
                              entry.id,
                              entry.kind === "staff" ? "t" : "s",
                              "skip",
                              entry.kind === "staff" ? staffRows.length : studentRows.length,
                              (i) => {
                                const m =
                                  entry.kind === "staff"
                                    ? staffMatchFor(entry.id, i)
                                    : studentMatchFor(entry.id, i);
                                return !!m && m.status !== "new";
                              }
                            )
                          }
                          className="px-2 py-0.5 rounded-md text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors cursor-pointer"
                        >
                          Skip all
                        </button>
                        <button
                          onClick={() =>
                            setAllRowResolutions(
                              entry.id,
                              entry.kind === "staff" ? "t" : "s",
                              "overwrite",
                              entry.kind === "staff" ? staffRows.length : studentRows.length,
                              (i) => {
                                const m =
                                  entry.kind === "staff"
                                    ? staffMatchFor(entry.id, i)
                                    : studentMatchFor(entry.id, i);
                                return !!m && m.status !== "new";
                              }
                            )
                          }
                          className="px-2 py-0.5 rounded-md text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                          Update all existing
                        </button>
                        <button
                          onClick={() =>
                            setAllRowResolutions(
                              entry.id,
                              entry.kind === "staff" ? "t" : "s",
                              "keep_both",
                              entry.kind === "staff" ? staffRows.length : studentRows.length,
                              (i) => {
                                const m =
                                  entry.kind === "staff"
                                    ? staffMatchFor(entry.id, i)
                                    : studentMatchFor(entry.id, i);
                                return !!m && m.status !== "new";
                              }
                            )
                          }
                          className="px-2 py-0.5 rounded-md text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 transition-colors cursor-pointer"
                        >
                          Keep both duplicates
                        </button>
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          Nothing is overwritten without your choice — duplicates skip by default.
                        </span>
                      </div>
                    )}
                    <div className="max-h-40 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/5 sticky top-0">
                          <tr>
                            <th className="text-left p-2.5 font-medium">Row</th>
                            {entry.kind === "students" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Name</th>
                                <th className="text-left p-2.5 font-medium">Adm No</th>
                                <th className="text-left p-2.5 font-medium">Class</th>
                              </>
                            )}
                            {entry.kind === "staff" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Name</th>
                                <th className="text-left p-2.5 font-medium">Staff No</th>
                                <th className="text-left p-2.5 font-medium">Department</th>
                              </>
                            )}
                            {entry.kind === "fees" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Class</th>
                                <th className="text-left p-2.5 font-medium">Stream</th>
                                <th className="text-left p-2.5 font-medium">Amount</th>
                              </>
                            )}
                            {entry.kind === "attendance" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Adm No</th>
                                <th className="text-left p-2.5 font-medium">Status</th>
                                <th className="text-left p-2.5 font-medium">Date</th>
                              </>
                            )}
                            {entry.kind === "fee-payments" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Student</th>
                                <th className="text-left p-2.5 font-medium">Adm No</th>
                                <th className="text-left p-2.5 font-medium">Amount</th>
                                <th className="text-left p-2.5 font-medium">Method</th>
                                <th className="text-left p-2.5 font-medium">Status</th>
                              </>
                            )}
                            {entry.kind === "subjects" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Subject</th>
                                <th className="text-left p-2.5 font-medium">Code</th>
                                <th className="text-left p-2.5 font-medium">Level</th>
                                <th className="text-left p-2.5 font-medium">Status</th>
                              </>
                            )}
                            {entry.kind === "classes" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Class</th>
                                <th className="text-left p-2.5 font-medium">Stream</th>
                                <th className="text-left p-2.5 font-medium">Status</th>
                              </>
                            )}
                            {entry.kind === "terms" && (
                              <>
                                <th className="text-left p-2.5 font-medium">Term</th>
                                <th className="text-left p-2.5 font-medium">Year</th>
                                <th className="text-left p-2.5 font-medium">Dates</th>
                                <th className="text-left p-2.5 font-medium">Status</th>
                              </>
                            )}
                            {(entry.kind === "students" || entry.kind === "staff") && (
                              <>
                                <th className="text-left p-2.5 font-medium">Match</th>
                                <th className="text-left p-2.5 font-medium">Action</th>
                              </>
                            )}
                            {entry.kind === "fees" && <th className="text-left p-2.5 font-medium">Status</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {entry.kind === "students" &&
                            studentRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              const match = studentMatchFor(entry.id, i);
                              const action = actionFor(entry.id, i, "s", match);
                              const isDuplicate = !!match && match.status !== "new";
                              return (
                                <tr key={`s${i}`} className="border-t border-border">
                                  <td className="p-2.5 text-muted-foreground">{rowNum}</td>
                                  <td className="p-2.5 font-medium">{r.firstName} {r.lastName}</td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{r.admNo}</td>
                                  <td className="p-2.5">{r.className}{r.streamName ? ` · ${r.streamName}` : ""}</td>
                                  <td className="p-2.5">
                                    {isDuplicate ? (
                                      <div className="space-y-1">
                                        <Badge variant={match!.status === "conflicting" ? "danger" : "warning"}>
                                          {match!.status === "conflicting" ? "Conflict" : "Duplicate"}
                                        </Badge>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                          Already applied to {match!.matched?.name} ({match!.matched?.admNo})
                                          {match!.matched?.className ? ` · ${match!.matched.className}` : ""}
                                        </p>
                                      </div>
                                    ) : rowIssues.some((x) => x.type === "error") ? (
                                      <Badge variant="danger">Missing fields</Badge>
                                    ) : (
                                      <Badge variant="success">New</Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    <Select
                                      value={action}
                                      onChange={(e) => setRowResolution(entry.id, i, "s", e.target.value as RowResolution)}
                                      className="h-8 text-xs"
                                    >
                                      {isDuplicate ? (
                                        <>
                                          <option value="skip">Skip (default)</option>
                                          <option value="overwrite">Update existing</option>
                                          <option value="keep_both">Keep both (new record)</option>
                                        </>
                                      ) : (
                                        <>
                                          <option value="create">Import</option>
                                          <option value="skip">Skip</option>
                                        </>
                                      )}
                                    </Select>
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "students" && studentRows.length > 20 && (
                            <tr>
                              <td colSpan={6} className="p-2 text-[11px] text-muted-foreground">
                                Showing first 20 of {studentRows.length} rows — all rows are still processed with the actions you choose.
                              </td>
                            </tr>
                          )}
                          {entry.kind === "students" && staffRows.length > 0 && (
                            <>
                              <tr>
                                <td colSpan={6} className="p-2 pt-3 text-xs font-semibold uppercase text-amber-600 bg-amber-50/60">
                                  {staffRows.length} staff row{staffRows.length === 1 ? "" : "s"} detected in this students file — kept separate
                                </td>
                              </tr>
                              {staffRows.slice(0, 5).map((r, i) => {
                                const rowNum = studentRows.length + i + 2;
                                return (
                                  <tr key={`t${i}`} className="border-t border-border">
                                    <td className="p-2.5 text-muted-foreground">{rowNum}</td>
                                    <td className="p-2.5 font-medium">{r.firstName} {r.lastName}</td>
                                    <td className="p-2.5 font-mono text-muted-foreground">{r.staffNo}</td>
                                    <td className="p-2.5 text-muted-foreground">{r.department ?? "—"}</td>
                                    <td className="p-2.5">
                                      <Badge variant={r.category === "non_teaching" ? "secondary" : "default"}>
                                        {r.category === "non_teaching" ? "Staff" : "Teacher"}
                                      </Badge>
                                    </td>
                                    <td className="p-2.5" />
                                  </tr>
                                );
                              })}
                            </>
                          )}
                          {entry.kind === "staff" &&
                            staffRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              const match = staffMatchFor(entry.id, i);
                              const action = actionFor(entry.id, i, "t", match);
                              const isDuplicate = !!match && match.status !== "new";
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 text-muted-foreground">{rowNum}</td>
                                  <td className="p-2.5 font-medium">{r.firstName} {r.lastName}</td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{r.staffNo}</td>
                                  <td className="p-2.5 text-muted-foreground">{r.department ?? "—"}</td>
                                  <td className="p-2.5">
                                    {isDuplicate ? (
                                      <div className="space-y-1">
                                        <Badge variant={match!.status === "conflicting" ? "danger" : "warning"}>
                                          {match!.status === "conflicting" ? "Conflict" : "Duplicate"}
                                        </Badge>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                          Already applied to {match!.matched?.name} ({match!.matched?.staffNo})
                                        </p>
                                      </div>
                                    ) : rowIssues.some((x) => x.type === "error") ? (
                                      <Badge variant="danger">Missing fields</Badge>
                                    ) : (
                                      <Badge variant="success">New</Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    <Select
                                      value={action}
                                      onChange={(e) => setRowResolution(entry.id, i, "t", e.target.value as RowResolution)}
                                      className="h-8 text-xs"
                                    >
                                      {isDuplicate ? (
                                        <>
                                          <option value="skip">Skip (default)</option>
                                          <option value="overwrite">Update existing</option>
                                          <option value="keep_both">Keep both (new record)</option>
                                        </>
                                      ) : (
                                        <>
                                          <option value="create">Import</option>
                                          <option value="skip">Skip</option>
                                        </>
                                      )}
                                    </Select>
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "fees" &&
                            feeRows.slice(0, 5).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 text-muted-foreground">{rowNum}</td>
                                  <td className="p-2.5 font-medium">{r.className}</td>
                                  <td className="p-2.5 text-muted-foreground">{r.streamName ?? "—"}</td>
                                  <td className="p-2.5 font-medium">{r.amount.toLocaleString()}</td>
                                  <td className="p-2.5">
                                    {rowIssues.length === 0 ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : rowIssues.every((x) => x.type === "warn") ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "attendance" &&
                            attendanceRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 font-mono text-muted-foreground">{r.admNo}</td>
                                  <td className="p-2.5">
                                    <Badge
                                      variant={
                                        r.status === "present"
                                          ? "success"
                                          : r.status === "late"
                                            ? "warning"
                                            : "danger"
                                      }
                                    >
                                      {r.status}
                                    </Badge>
                                  </td>
                                  <td className="p-2.5 text-muted-foreground">
                                    {r.date ? new Date(r.date).toLocaleDateString() : "Today"}
                                    {rowIssues.length > 0 && (
                                      <XCircle className="h-3.5 w-3.5 text-red-500 inline ml-1" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "attendance" && attendanceRows.length > 20 && (
                            <tr>
                              <td colSpan={3} className="p-2 text-[11px] text-muted-foreground">
                                Showing first 20 of {attendanceRows.length} rows.
                              </td>
                            </tr>
                          )}
                          {entry.kind === "fee-payments" &&
                            feePaymentRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 font-medium">{r.studentName || r.admNo || "—"}</td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{r.admNo || "—"}</td>
                                  <td className="p-2.5 font-medium">{r.amount.toLocaleString()}</td>
                                  <td className="p-2.5 text-muted-foreground capitalize">{r.method}</td>
                                  <td className="p-2.5">
                                    {rowIssues.length === 0 ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : rowIssues.every((x) => x.type === "warn") ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "subjects" &&
                            subjectRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 font-medium">{r.name}</td>
                                  <td className="p-2.5 font-mono text-muted-foreground">{r.code}</td>
                                  <td className="p-2.5 text-muted-foreground">{r.level ? r.level.replace(/_/g, " ") : "General"}</td>
                                  <td className="p-2.5">
                                    {rowIssues.length === 0 ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : rowIssues.every((x) => x.type === "warn") ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "classes" &&
                            classRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 font-medium">{r.className}</td>
                                  <td className="p-2.5 text-muted-foreground">{r.streamName ?? "—"}</td>
                                  <td className="p-2.5">
                                    {rowIssues.length === 0 ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : rowIssues.every((x) => x.type === "warn") ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "terms" &&
                            termRows.slice(0, 20).map((r, i) => {
                              const rowNum = i + 2;
                              const rowIssues = issues.filter((x) => x.row === rowNum);
                              return (
                                <tr key={i} className="border-t border-border">
                                  <td className="p-2.5 font-medium">{r.name}</td>
                                  <td className="p-2.5 text-muted-foreground">{r.year}</td>
                                  <td className="p-2.5 text-muted-foreground">
                                    {r.startDate ? new Date(r.startDate).toLocaleDateString() : "—"}{" "}
                                    {r.startDate && r.endDate ? "→" : ""}{" "}
                                    {r.endDate ? new Date(r.endDate).toLocaleDateString() : ""}
                                  </td>
                                  <td className="p-2.5">
                                    {rowIssues.length === 0 ? (
                                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : rowIssues.every((x) => x.type === "warn") ? (
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          {entry.kind === "school-docs" && (
                            <tr className="border-t border-border">
                              <td colSpan={6} className="p-3">
                                <div className="flex items-start gap-2">
                                  <FileText className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-xs font-medium">
                                      Recognized as a school document (policy / report / profile) — filed under School
                                      Profile, no rows to import.
                                    </p>
                                    {entry.docText && (
                                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 max-w-2xl">
                                        {entry.docText.slice(0, 300)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {entry.kind === "staff" && staffRows.length > 20 && (
                            <tr>
                              <td colSpan={6} className="p-2 text-[11px] text-muted-foreground">
                                Showing first 20 of {staffRows.length} rows — all rows are still processed with the actions you choose.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {totalErrors > 0 && (
                  <div className="text-xs space-y-1 max-h-24 overflow-y-auto">
                    {filePreviews.flatMap(({ entry, issues }) =>
                      issues.filter((i) => i.type === "error").slice(0, 6).map((issue, i) => (
                        <div key={`${entry.id}-${i}`} className="flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          <span className="text-red-600">
                            {entry.fileName} · Row {issue.row}: {issue.reason}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

            {queue.length > 0 && readyFiles.length > 0 && readyFiles.length === queue.length && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    All {readyFiles.length} file{readyFiles.length === 1 ? "" : "s"} uploaded and auto-detected successfully.
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Nothing is saved yet — continue to Map Columns and Review to confirm, then Import.
                  </p>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-6 bg-background/90 backdrop-blur-sm z-10 border-t border-border flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("map")} disabled={running}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={handleRun}
                    disabled={running || filePreviews.length === 0 || (totalRows === 0 && totalSchoolDocs === 0)}
                  >
                    {running ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {running ? "Importing…" : `Import ${readyFiles.length} file${readyFiles.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 4: Done ───────────────────────────────────── */}
        {step === "done" && report && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">
                  Import complete — {readyFiles.filter((f) => f.importStatus === "done").length} of {readyFiles.length} files
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {report.studentsCreated > 0 && `${report.studentsCreated} students created`}
                  {report.studentsCreated > 0 && report.guardiansCreated > 0 && ` · ${report.guardiansCreated} guardians linked`}
                  {report.studentsCreated > 0 && report.staffCreated > 0 && " · "}
                  {report.staffCreated > 0 &&
                    `${report.staffCreated} staff created (${report.staffTeaching} teaching · ${report.staffNonTeaching} non-teaching)`}
                  {(report.staffCreated > 0 || report.guardiansCreated > 0) && report.structuresCreated > 0 && " · "}
                  {report.structuresCreated > 0 && `${report.structuresCreated} fee structures created`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0) && report.attendanceCreated > 0 && " · "}
                  {report.attendanceCreated > 0 && `${report.attendanceCreated} attendance record${report.attendanceCreated === 1 ? "" : "s"} created`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0 || report.attendanceCreated > 0) && report.feePaymentsCreated > 0 && " · "}
                  {report.feePaymentsCreated > 0 && `${report.feePaymentsCreated} fee payment${report.feePaymentsCreated === 1 ? "" : "s"} recorded`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0 || report.attendanceCreated > 0 || report.feePaymentsCreated > 0) && report.subjectsCreated > 0 && " · "}
                  {report.subjectsCreated > 0 && `${report.subjectsCreated} subject${report.subjectsCreated === 1 ? "" : "s"} created`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0 || report.attendanceCreated > 0 || report.feePaymentsCreated > 0 || report.subjectsCreated > 0) && report.classesCreated > 0 && " · "}
                  {report.classesCreated > 0 && `${report.classesCreated} class${report.classesCreated === 1 ? "" : "es"} created`}
                  {report.classesCreated > 0 && report.streamsCreated > 0 && ` · ${report.streamsCreated} streams created`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0 || report.attendanceCreated > 0 || report.feePaymentsCreated > 0 || report.subjectsCreated > 0 || report.classesCreated > 0) && report.termsCreated > 0 && " · "}
                  {report.termsCreated > 0 && `${report.termsCreated} term${report.termsCreated === 1 ? "" : "s"} created`}
                  {(report.structuresCreated > 0 || report.staffCreated > 0 || report.guardiansCreated > 0 || report.attendanceCreated > 0 || report.feePaymentsCreated > 0 || report.subjectsCreated > 0 || report.classesCreated > 0 || report.termsCreated > 0) && report.schoolDocsRecognized > 0 && " · "}
                  {report.schoolDocsRecognized > 0 && `${report.schoolDocsRecognized} school document${report.schoolDocsRecognized === 1 ? "" : "s"} recognized`}
                  {report.studentsCreated === 0 && report.guardiansCreated === 0 && report.staffCreated === 0 && report.structuresCreated === 0 && report.attendanceCreated === 0 && report.feePaymentsCreated === 0 && report.subjectsCreated === 0 && report.classesCreated === 0 && report.streamsCreated === 0 && report.termsCreated === 0 && report.schoolDocsRecognized === 0 &&
                    (report.errors.length === 0 && report.studentsSkipped > 0
                      ? `All ${report.studentsSkipped} students already existed and were skipped — no duplicates were added`
                      : "Nothing was created")}
                  {!(report.studentsCreated === 0 && report.guardiansCreated === 0 && report.staffCreated === 0 && report.structuresCreated === 0 && report.attendanceCreated === 0 && report.feePaymentsCreated === 0 && report.subjectsCreated === 0 && report.classesCreated === 0 && report.streamsCreated === 0 && report.termsCreated === 0 && report.schoolDocsRecognized === 0 && report.errors.length === 0 && report.studentsSkipped > 0) &&
                    report.studentsSkipped > 0 &&
                    ` · ${report.studentsSkipped} skipped (duplicates)`}
                  {report.studentsOverwritten > 0 && ` · ${report.studentsOverwritten} student record${report.studentsOverwritten === 1 ? "" : "s"} updated`}
                  {report.staffOverwritten > 0 && ` · ${report.staffOverwritten} staff record${report.staffOverwritten === 1 ? "" : "s"} updated`}
                  {report.errors.length > 0 && ` · ${report.errors.length} errors`}
                  {report.failedFiles > 0 && ` · ${report.failedFiles} file(s) failed`}
                </p>
                {report.manualFeeApplied && (
                  <p className="text-xs text-green-700 mt-1">
                    Applied your onboarding fee of {report.manualFeeAmount?.toLocaleString()} to {report.manualFeeClassCount} class{report.manualFeeClassCount === 1 ? "" : "es"}.
                  </p>
                )}
                {report.termCreated && (
                  <p className="text-xs text-green-700 mt-1">
                    Created term <span className="font-semibold">{report.termCreated.name}</span> ({report.termCreated.year}) so your fee structures appear in the Fees section.
                  </p>
                )}
              </div>
            </div>

            {report.studentsCreated === 0 &&
              report.staffCreated === 0 &&
              report.structuresCreated === 0 &&
              report.attendanceCreated === 0 &&
              report.feePaymentsCreated === 0 &&
              report.subjectsCreated === 0 &&
              report.classesCreated === 0 &&
              report.termsCreated === 0 &&
              report.errors.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    Nothing was imported yet — here&apos;s how to fix it
                  </div>
                  <ul className="text-xs text-amber-700 mt-1.5 list-disc list-inside space-y-1">
                    <li>
                      Download the errors below (or reopen the file) and review the reasons — most are per-row.
                    </li>
                    <li>
                      <span className="font-medium">Classes missing?</span> If the file uses classes/streams that don&apos;t exist
                      yet, re-open it and tick <span className="font-medium">&quot;Create classes/streams that don&apos;t exist yet&quot;</span> before importing.
                    </li>
                    <li>
                      <span className="font-medium">Columns not picked up?</span> Use the <span className="font-medium">Map Columns</span> step
                      to match your headers to the right fields.
                    </li>
                  </ul>
                </div>
              )}

            <div className="space-y-2">
              {readyFiles.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="shrink-0">
                    {entry.importStatus === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : entry.importStatus === "error" ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.fileName}</p>
                    {entry.importStatus === "done" && entry.report ? (
                      <p className="text-xs text-muted-foreground">
                        {entry.report.students?.created
                          ? `${entry.report.students.created} students`
                          : ""}
                        {entry.report.students?.overwritten
                          ? `${entry.report.students.created ? " · " : ""}${entry.report.students.overwritten} updated`
                          : ""}
                        {entry.report.students?.guardiansCreated
                          ? ` · ${entry.report.students.guardiansCreated} guardians linked`
                          : ""}
                        {entry.report.staff?.created
                          ? `${entry.report.students?.created ? " · " : ""}${entry.report.staff.created} staff`
                          : ""}
                        {entry.report.fees?.structuresCreated
                          ? `${entry.report.fees.structuresCreated} fee structures`
                          : ""}
                        {entry.report.fees?.resolutions && entry.report.fees.resolutions.length > 0
                          ? ` · ${entry.report.fees.resolutions.length} classes reconciled (e.g. ${entry.report.fees.resolutions[0]!.className} → ${entry.report.fees.resolutions[0]!.matchedClass}${entry.report.fees.resolutions[0]!.matchedStream ? ` · ${entry.report.fees.resolutions[0]!.matchedStream}` : ""})`
                          : ""}
                        {entry.report.feePayments?.created
                          ? ` · ${entry.report.feePayments.created} fee payments`
                          : ""}
                        {entry.report.subjects?.created
                          ? ` · ${entry.report.subjects.created} subjects`
                          : ""}
                        {entry.report.classes?.classesCreated
                          ? ` · ${entry.report.classes.classesCreated} classes`
                          : ""}
                        {entry.report.terms?.termsCreated
                          ? ` · ${entry.report.terms.termsCreated} terms`
                          : ""}
                        {entry.report.schoolDocs?.recognized
                          ? ` · school document recognized`
                          : ""}
                        {entry.report.students?.errors.length
                          ? `${entry.report.students.errors.length} errors`
                          : ""}
                        {entry.report.staff?.errors.length
                          ? ` · ${entry.report.staff.errors.length} staff errors`
                          : ""}
                        {entry.report.fees?.errors.length
                          ? ` · ${entry.report.fees.errors.length} fee errors`
                          : ""}
                      </p>
                    ) : entry.importStatus === "error" ? (
                      <p className="text-xs text-red-600">{entry.importError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not imported</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {report.createdClasses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Classes created: <span className="font-medium text-foreground">{report.createdClasses.join(", ")}</span>
                {report.createdStreams.length > 0 && (
                  <> · Streams created: <span className="font-medium text-foreground">{report.createdStreams.join(", ")}</span></>
                )}
              </p>
            )}

            {report.errors.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  const csvRows = report.errors.map(e => `"${e.file}",Row ${e.row},"${e.reason}"`);
                  const csv = `File,Row,Reason\n${csvRows.join("\n")}`;
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'import_errors.csv';
                  link.click();
                  URL.revokeObjectURL(url);
                }}>
                  <FileDown className="h-4 w-4 mr-2" /> Download Errors
                </Button>
                <div className="rounded-lg border border-border overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5 sticky top-0">
                      <tr>
                        <th className="text-left p-2.5 font-medium">File</th>
                        <th className="text-left p-2.5 font-medium">Row</th>
                        <th className="text-left p-2.5 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.slice(0, 30).map((e, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2.5 text-muted-foreground">{e.file}</td>
                          <td className="p-2.5 text-muted-foreground">{e.row || "—"}</td>
                          <td className="p-2.5">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-6 bg-background/90 backdrop-blur-sm z-10 border-t border-border flex justify-end gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>Import Another Batch</Button>
              <Button onClick={handleClose}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Save & Done
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {queue.length} file{queue.length === 1 ? "" : "s"} queued · Teachers and staff are kept
          separate from students · Every row is validated again on the server before saving.
        </p>
      </div>
    </Modal>
  );
}
