/**
 * Smart file classifier — decides what kind of school record a file contains
 * from its headers, filename, a content sample AND (for PDF/DOCX prose) its
 * extracted text, so an uploaded file is always routed to the right section
 * instead of being dumped into the wrong one (e.g. a teacher list into
 * students, or a fee-payment/balance sheet into the student master list).
 *
 * Kinds:
 *   students      — student master list / roster (names + admission numbers)
 *   staff         — teachers + non-teaching staff
 *   fees          — fee structures (class → amount)
 *   fee-payments  — payment / balance / receipt sheets (student → money)
 *   subjects      — subject catalog (name / code / level / teacher)
 *   classes       — class & stream list (no student names)
 *   terms         — term / academic-year schedule
 *   attendance    — attendance registers
 *   school-info   — school profile data
 *   school-docs   — prose documents (policy, reports, guidelines, master data)
 *   admission-letters — admission offer / acceptance letters
 *   report-cards  — academic report cards / progress reports
 *   transfer-letters — transfer / school-leaving letters
 *   logs          — audit/activity exports
 *   unknown       — nothing matched confidently (never guessed)
 */

export type DocKind =
  | "students"
  | "staff"
  | "fees"
  | "fee-payments"
  | "subjects"
  | "classes"
  | "terms"
  | "attendance"
  | "school-info"
  | "school-docs"
  | "admission-letters"
  | "report-cards"
  | "transfer-letters"
  | "logs"
  | "unknown";

export interface Classification {
  kind: DocKind;
  confidence: "high" | "medium" | "low";
  score: number;
  matched: number;
  signals: string[];
}

export interface KindGuide {
  label: string;
  href: string;
  note: string;
}

export const KIND_GUIDES: Record<DocKind, KindGuide> = {
  students: { label: "Students", href: "/dashboard/students", note: "Student records" },
  staff: { label: "Teachers / Staff", href: "/dashboard/teachers", note: "Staff records" },
  fees: { label: "Fee schedule", href: "/dashboard/fees", note: "Fee structures" },
  "fee-payments": { label: "Fee payments & balances", href: "/dashboard/fees", note: "Payments / balances per student" },
  subjects: { label: "Subjects", href: "/dashboard/subjects", note: "Subject catalog" },
  classes: { label: "Classes & Streams", href: "/dashboard/classes", note: "Class/stream list" },
  terms: { label: "Terms", href: "/dashboard/terms", note: "Term schedule" },
  attendance: { label: "Attendance", href: "/dashboard/attendance", note: "Attendance register" },
  "school-info": { label: "School Profile (Settings)", href: "/dashboard/settings", note: "School information" },
  "school-docs": { label: "School document", href: "/dashboard/settings", note: "Policy / report / reference document" },
  "admission-letters": { label: "Admission letter", href: "/dashboard/admissions", note: "Admission offer / acceptance letter" },
  "report-cards": { label: "Report card", href: "/dashboard/records", note: "Academic report card / progress report" },
  "transfer-letters": { label: "Transfer letter", href: "/dashboard/records", note: "Transfer / school-leaving letter" },
  logs: { label: "Audit Logs", href: "/dashboard/settings", note: "Activity/audit logs (system-generated)" },
  unknown: { label: "Unrecognized", href: "/dashboard", note: "Could not determine file type" },
};

type Marker = { re: RegExp; weight: number; label: string };

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

const MARKERS: Record<DocKind, Marker[]> = {
  students: [
    { re: /admissionnumber|admissionno|admno|admissionno_|regno|studentid/, weight: 3, label: "admission/adm number" },
    { re: /dateofbirth|dob|dateofbirth/, weight: 2, label: "date of birth" },
    { re: /student|learner|pupil/, weight: 3, label: "student/learner column" },
    { re: /guardian|parentname|parentphone|parentcontact|emergency/, weight: 2, label: "guardian/parent" },
    { re: /fullname|firstname|lastname|middlename|studentname|learnersname/, weight: 2, label: "name column" },
    { re: /stream|class|grade|form|house/, weight: 1, label: "class/stream" },
    { re: /gender|sex/, weight: 1, label: "gender" },
  ],
  staff: [
    { re: /staffno|staffnumber|staffid|employeeid|employeenumber|staffno_/, weight: 3, label: "staff number" },
    { re: /tsc|tscno|tscnumber/, weight: 3, label: "TSC number" },
    { re: /teacher|staff|employee/, weight: 3, label: "teacher/staff column" },
    { re: /qualification|salary|employmentdate|dateemployed|jobtitle|position/, weight: 2, label: "employment details" },
    { re: /department|designation|role/, weight: 1, label: "department/role" },
  ],
  fees: [
    { re: /schoolfees|feestructure|feename|feecategory|feetype|termfee|tuition/, weight: 3, label: "fee column" },
    { re: /feeamount|amount|balancedue|amountdue/, weight: 2, label: "amount" },
    { re: /class|grade|stream|term/, weight: 1, label: "class/term" },
  ],
  "fee-payments": [
    { re: /amountpaid|paidamount|amountpaid|paid|payment|payments|receipt|receiptno|receiptnumber|received/, weight: 3, label: "payment/paid column" },
    { re: /balance|bal|outstanding|arrears|amountdue|credited|credit|debit/, weight: 3, label: "balance/outstanding column" },
    { re: /amount|ksh|fee|fees|tuition/, weight: 2, label: "money column" },
    { re: /paymentdate|transactiondate|transdate|receivedon|datepaid/, weight: 1, label: "payment date" },
  ],
  subjects: [
    { re: /subjectname|subjectcode|subjectno|subject/, weight: 3, label: "subject column" },
    { re: /coursecode|coursename|course/, weight: 2, label: "course column" },
    { re: /^code$|code/, weight: 1, label: "code" },
    { re: /level|stage|compulsory|optional|core|elective/, weight: 1, label: "subject level/type" },
  ],
  classes: [
    { re: /classname|class|grade|form|level|house/, weight: 3, label: "class/grade column" },
    { re: /stream|arm|section/, weight: 2, label: "stream column" },
    { re: /capacity|maxstudents|classcapacity|classteacher|classroom|room/, weight: 2, label: "class details" },
  ],
  terms: [
    { re: /termname|term|semester|session|periodname/, weight: 3, label: "term/session column" },
    { re: /startdate|begins|opens|enddate|ends|closes|datefrom|dateto/, weight: 2, label: "start/end dates" },
    { re: /academicyear|year/, weight: 1, label: "academic year" },
  ],
  attendance: [
    { re: /checkin|checkin|timein|timeout|arrivaltime|departuretime|clockin|clockout/, weight: 3, label: "check-in/out time" },
    { re: /attendance|attendancestatus|present|absent|latetime|status/, weight: 3, label: "attendance status" },
    { re: /date|day|period|subject/, weight: 1, label: "date/period" },
  ],
  "school-info": [
    { re: /schoolname|schooladdress|physicaladdress|postaladdress|pobox|p\.o\.box/, weight: 3, label: "school name/address" },
    { re: /motto|vision|mission|established|founded|registrationno|regno/, weight: 3, label: "school details" },
    { re: /schoolemail|schoolphone|contact|logo|color|county|district|ward/, weight: 2, label: "school contact" },
  ],
  "school-docs": [],
  "admission-letters": [],
  "report-cards": [],
  "transfer-letters": [],
  logs: [
    { re: /timestamp|logtime|loggedat|eventtime/, weight: 3, label: "timestamp" },
    { re: /action|event|activity|description|detail/, weight: 2, label: "action/event" },
    { re: /actor|performedby|user|username|role|ipaddress|device|useragent|changes/, weight: 2, label: "actor/device" },
  ],
  unknown: [],
};

function filenameHints(fileName: string): DocKind[] {
  const n = fileName.toLowerCase();
  const hints: DocKind[] = [];
  if (/teacher|staff|employee/.test(n)) hints.push("staff");
  if (/student|learner|pupil|adm|admission|roster|register/.test(n)) hints.push("students");
  if (/fee|fees|tuition/.test(n)) hints.push("fees");
  if (/payment|paid|receipt|balance|statement|arrears|debtor/.test(n)) hints.push("fee-payments");
  if (/subject|curriculum|courselist|courses/.test(n)) hints.push("subjects");
  if (/class|stream|grade|form|house/.test(n)) hints.push("classes");
  if (/term|semester|academicyear|calendar/.test(n)) hints.push("terms");
  if (/attend|register|checkin|check-in|rollcall/.test(n)) hints.push("attendance");
  if (/school|profile|info/.test(n)) hints.push("school-info");
  if (/policy|guideline|regulation|handbook|manual|report|charter|strategy|master.?data|constitution/.test(n)) hints.push("school-docs");
  if (/admission.?letter|offer.?letter|acceptance.?letter|joining.?instructions|admission.?offer/.test(n)) hints.push("admission-letters");
  if (/report.?card|progress.?report|academic.?report|termly.?report|report.?sheet|end.?of.?term|term.?report/.test(n)) hints.push("report-cards");
  if (/transfer.?letter|transfer.?certificate|school.?leaving|leaving.?certificate|release.?letter|withdrawal.?letter/.test(n)) hints.push("transfer-letters");
  if (/log|audit|activity/.test(n)) hints.push("logs");
  return hints;
}

function contentSignals(rows: Record<string, unknown>[]): Partial<Record<DocKind, number>> {
  const signals: Partial<Record<DocKind, number>> = {};
  let attendanceHits = 0;
  let staffHits = 0;
  let nameCells = 0;
  const sample = rows.slice(0, 10);
  for (const row of sample) {
    for (const v of Object.values(row)) {
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) continue;
      if (/^(present|absent|late|permission|excused|unexcused)$/.test(s)) attendanceHits++;
      if (/^(teacher|tutor|driver|cleaner|nurse|secretary|bursar|principal|head.?teacher)$/.test(s)) staffHits++;
      if (nameCells < 20 && /^[a-z][a-z' -]{2,}\s[a-z][a-z' -]{2,}$/.test(s)) nameCells++;
    }
  }
  if (attendanceHits >= 2) signals.attendance = Math.min(6, attendanceHits);
  if (staffHits >= 2) signals.staff = Math.min(6, staffHits);
  if (attendanceHits > 0 && nameCells > 0) signals.attendance = (signals.attendance ?? 0) + 1;
  return signals;
}

function scoreKind(
  kind: DocKind,
  headers: string[],
  rows: Record<string, unknown>[],
  hints: DocKind[]
): { score: number; matched: number; signals: string[] } {
  if (kind === "unknown") return { score: 0, matched: 0, signals: [] };
  let score = 0;
  let matched = 0;
  const signals: string[] = [];
  for (const marker of MARKERS[kind]) {
    for (const h of headers) {
      if (marker.re.test(norm(h))) {
        score += marker.weight;
        matched++;
        signals.push(marker.label);
        break;
      }
    }
  }
  const content = contentSignals(rows);
  const contentBoost = content[kind] ?? 0;
  if (contentBoost) {
    score += contentBoost;
    signals.push(`${contentBoost} matching cell values`);
  }
  if (hints.includes(kind)) {
    score += 2;
    signals.push("filename matches");
  }
  return { score, matched, signals };
}

// ── Prose-document classification (PDF / DOCX / scanned text) ────────
// When a file has no tabular structure (no headers/rows) but the extractor
// produced readable text, decide what the document IS by its content so it
// never comes back as an empty "unknown". Returns the kind + a one-line
// description shown in the UI.

// Prose-document kinds that are safe to infer from the filename alone (they
// are "file it" kinds — no row import ever runs for them, so a filename hint
// can never mis-insert data into a table). Ordered most-specific first so a
// filename like "progress-report-term2.pdf" is filed as a report card, not a
// generic school document.
const PROSE_HINT_KINDS: DocKind[] = [
  "report-cards",
  "admission-letters",
  "transfer-letters",
  "school-info",
  "school-docs",
  "logs",
];

const DOC_TEXT_KEYWORDS: { kind: DocKind; weight: number; re: RegExp; label: string }[] = [
  { kind: "school-info", weight: 3, re: /(school name|motto|vision|mission|postal address|p\.o\. box|registration number|founded|established|county|sub.?county|logo|colors?)\s*[:]/, label: "school profile fields" },
  { kind: "school-info", weight: 1, re: /\b(school|academy|institution|college)\b.{0,80}\b(established|founded|address|contact|motto|vision|mission)\b/i, label: "school profile text" },
  // Student document letters & cards — recognized by their distinctive
  // letterhead language so an admission letter, report card, or transfer
  // letter is filed under the right record instead of a generic "school
  // document". Weights are >= the generic school-docs "report" keyword so
  // the specific kind always wins.
  //
  // ORDERING CONSTRAINT: ties are broken by insertion order (stable sort),
  // so the specific kinds MUST stay listed before the generic school-docs
  // entries below.
  { kind: "admission-letters", weight: 4, re: /\b(admission\s*letter|letter\s*of\s*admission|offer\s*of\s*(admission|placement)|admission\s*offer|acceptance\s*letter|joining\s*instructions)\b/i, label: "admission letter" },
  { kind: "admission-letters", weight: 4, re: /\b(pleased\s*to\s*(inform|offer)|you\s*have\s*been\s*(offered|admitted)|has\s*been\s*(offered\s*(a\s+)?(place|admission)|admitted)|offer\s*(you|the)\s*admission)\b/i, label: "offer/admission language" },
  { kind: "admission-letters", weight: 3, re: /\b(admitted\s*to\s*(grade|class|form|pre|kindergarten)|report\s*to\s*the\s*school\s*on|proceed\s*to\s*the\s*school|admission\s*(number|no)\s*(assigned|allocated|is))\b/i, label: "admission placement details" },
  { kind: "report-cards", weight: 4, re: /\b(report\s*card|report\s*sheet|progress\s*report|academic\s*report|termly\s*report|term\s*report|report\s*for\s*the\s*(term|year))\b/i, label: "report card" },
  { kind: "report-cards", weight: 3, re: /\b(mean\s*grade|mean\s*score|class\s*position|position\s*in\s*class|grade\s*point)\b/i, label: "grading summary" },
  { kind: "report-cards", weight: 2, re: /\b(total\s*marks|average\s*(mark|score))\b/i, label: "marks/average" },
  { kind: "report-cards", weight: 3, re: /\b(class\s*teacher'?s?\s*(comment|remarks)|head.?teacher'?s?\s*(comment|remarks)|subject\s*teacher'?s?\s*(comment|remark))\b/i, label: "teacher comments" },
  { kind: "report-cards", weight: 2, re: /\b(continuous\s*assessment|end\s*of\s*term|mid.?term\s*(report|exam)|academic\s*performance|performance\s*grade)\b/i, label: "term assessment" },
  { kind: "transfer-letters", weight: 4, re: /\b(transfer\s*(letter|certificate|request)|school\s*leaving\s*(certificate|letter)|leaving\s*certificate|release\s*letter|letter\s*of\s*transfer|transferring\s*school)\b/i, label: "transfer/leaving letter" },
  { kind: "transfer-letters", weight: 3, re: /\b(transferred\s*(from|to)|has\s*been\s*(transferred|released)|seeking\s*admission\s*(to|at)|withdrawal\s*letter|no\s*longer\s*a\s*(student|pupil))\b/i, label: "transfer language" },
  { kind: "transfer-letters", weight: 2, re: /\b(conduct|character|disciplinary\s*record|attended\s+our\s+school|was\s+a\s+(student|pupil)\s+at\s+our\s+school)\b/i, label: "school-leaving details" },
  { kind: "school-docs", weight: 4, re: /\b(policy|policies)\b/i, label: "policy document" },
  { kind: "school-docs", weight: 4, re: /\b(guidelines?|regulations?|procedures?|handbook|charter|constitution|code of conduct)\b/i, label: "guidelines document" },
  { kind: "school-docs", weight: 2, re: /\b(report|minutes|review|strategy|master\s?data|school\s?profile|prospectus|curriculum\s?guide)\b/i, label: "school document" },
  { kind: "logs", weight: 2, re: /\b(audit\s?log|activity\s?log|performed\s?by|ip\s?address|user\s?agent|event\s?type)\b/i, label: "activity/audit log" },
];

function classifyTextDocument(text: string, fileName: string): Classification {
  const hints = filenameHints(fileName);
  const lower = text.slice(0, 20000).toLowerCase();
  const signals: string[] = [];
  const scored: { kind: DocKind; score: number }[] = [];

  for (const kw of DOC_TEXT_KEYWORDS) {
    if (kw.re.test(lower)) {
      signals.push(kw.label);
      const existing = scored.find((s) => s.kind === kw.kind);
      if (existing) existing.score += kw.weight;
      else scored.push({ kind: kw.kind, score: kw.weight });
    }
  }
  // Filename boosts for prose-relevant kinds only (a "roster.pdf" hint must
  // never turn prose into a student table).
  for (const h of PROSE_HINT_KINDS) {
    if (!hints.includes(h)) continue;
    const existing = scored.find((s) => s.kind === h);
    if (existing) existing.score += 2;
    else scored.push({ kind: h, score: 2 });
  }

  if (scored.length === 0) {
    // Fallback: still readable prose → treat as a school document rather
    // than silently coming back empty.
    return {
      kind: "school-docs",
      confidence: "low",
      score: 1,
      matched: 1,
      signals: ["readable document text (no spreadsheet structure)"],
    };
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!;
  const kind = top.kind;
  const confidence: Classification["confidence"] =
    top.score >= 4 ? "high" : top.score >= 2 ? "medium" : "low";
  return { kind, confidence, score: top.score, matched: top.score, signals };
}

// ── Header-pattern helpers used for disambiguation ───────────────────

function headerMatches(headers: string[], re: RegExp): boolean {
  return headers.some((h) => re.test(norm(h)));
}

export function classifyDocumentFile(
  headers: string[],
  rows: Record<string, unknown>[],
  fileName = "",
  text?: string
): Classification {
  const hints = filenameHints(fileName);

  // Prose documents (PDF/DOCX/image OCR): no tabular structure at all →
  // classify from the extracted text so they never come back empty/unknown.
  if (headers.length === 0 && rows.length === 0) {
    if (text && text.trim().length > 10) return classifyTextDocument(text, fileName);
    // No readable text — a filename that names a prose document kind is still
    // enough to file it under the right record (never a tabular kind). Most
    // specific kind wins (report card beats generic "report").
    const hintKind = PROSE_HINT_KINDS.find((h) => hints.includes(h));
    if (hintKind) {
      return {
        kind: hintKind,
        confidence: "low",
        score: 2,
        matched: 1,
        signals: [`filename indicates ${hintKind.replace(/-/g, " ")}`],
      };
    }
    return { kind: "unknown", confidence: "low", score: 0, matched: 0, signals: ["no headers, rows, or readable text"] };
  }

  const kinds: DocKind[] = [
    "students", "staff", "fees", "fee-payments", "subjects", "classes",
    "terms", "attendance", "school-info", "logs",
  ];

  const scored = kinds
    .map((kind) => ({ kind, ...scoreKind(kind, headers, rows, hints) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const runner = scored[1]!;

  // ── Disambiguation: student-related subtypes ──────────────────────
  // The #1 complaint was fee/balance sheets being classified as "students"
  // (they have name + class columns). Distinguish by what the file is FOR:
  const hasMoney = headerMatches(headers, /amount|amountpaid|paid|payment|receipt|balance|outstanding|arrears|amountdue|credited|debit/);
  const hasStudentIdentity = headerMatches(headers, /admissionnumber|admissionno|admno|regno|studentid|dateofbirth|guardian|parentname|emergency/);
  const hasNameColumn = headerMatches(headers, /fullname|firstname|lastname|studentname|learnersname|pupilname|name/);
  const hasClassColumn = headerMatches(headers, /class|grade|form|level|stream|house/);
  const hasStaffIdentity = headerMatches(headers, /staffno|staffnumber|employeeid|employeenumber|tscno|tsc/);
  const hasSubjectColumn = headerMatches(headers, /subject|coursecode|coursename|course/);
  const hasTermColumn = headerMatches(headers, /termname|semester|session|periodname/);

  const fp = scored.find((s) => s.kind === "fee-payments");
  const students = scored.find((s) => s.kind === "students");
  const classes = scored.find((s) => s.kind === "classes");
  const subjects = scored.find((s) => s.kind === "subjects");
  const staff = scored.find((s) => s.kind === "staff");
  const terms = scored.find((s) => s.kind === "terms");

  let winner = top;
  const extraSignals: string[] = [];

  // Fee payments / balance sheets: money + a name column, but no student
  // identity (no adm no / DOB / guardian) → this is payments, NOT students.
  if (hasMoney && hasNameColumn && !hasStudentIdentity && fp && fp.score >= 4) {
    if (!students || fp.score >= students.score) {
      winner = fp;
      extraSignals.push("money columns without student identity → payments/balances");
    }
  }

  // Fee structures: class/stream + an amount, but no student names → this
  // is the fee schedule (class → amount), not a class list or students.
  if (hasMoney && hasClassColumn && !hasNameColumn && !hasStudentIdentity) {
    const feeStruct = scored.find((s) => s.kind === "fees");
    if (feeStruct && feeStruct.score >= 3) {
      winner = feeStruct;
      extraSignals.push("class + amount columns without student names → fee schedule");
    }
  }

  // Class & stream lists: class columns + class details, no money, no
  // student names and no admission numbers → build classes, not students.
  if (hasClassColumn && !hasNameColumn && !hasStudentIdentity && !hasMoney && classes && classes.score >= 5) {
    if (!students || classes.score > students.score) {
      winner = classes;
      extraSignals.push("class columns without student names → class list");
    }
  }

  // Subject catalogs: subject/course columns, no staff identity numbers.
  if (hasSubjectColumn && !hasStaffIdentity && subjects && subjects.score >= 5) {
    if (!staff || subjects.score > staff.score) {
      winner = subjects;
      extraSignals.push("subject/course columns → subject catalog");
    }
  }

  // Term schedules: explicit term/session columns.
  if (hasTermColumn && terms && terms.score >= 5 && terms.score >= top.score) {
    winner = terms;
    extraSignals.push("term/session columns → term schedule");
  }

  // ── Confidence ────────────────────────────────────────────────────
  let confidence: Classification["confidence"] = "low";
  if (winner.score >= 9 && winner.score - runner.score >= 2) confidence = "high";
  else if (winner.score >= 6 && winner.score - runner.score >= 1) confidence = "medium";
  else if (winner.score >= 3) confidence = "low";

  const kind: DocKind = confidence === "low" && winner.score < 4 ? "unknown" : winner.kind;

  return {
    kind,
    confidence: kind === "unknown" ? "low" : confidence,
    score: winner.score,
    matched: winner.matched,
    signals: [...winner.signals, ...extraSignals],
  };
}

export function suggestKind(headers: string[], rows: Record<string, unknown>[], fileName = ""): Classification {
  return classifyDocumentFile(headers, rows, fileName);
}
