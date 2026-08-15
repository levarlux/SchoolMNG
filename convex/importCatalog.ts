import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership } from "./helpers";
import type { Doc } from "./_generated/dataModel";

/**
 * School-specific import catalog (Phase 17C).
 *
 * THE single source of truth for which fields an uploaded file can map to.
 * Combines, per entity kind:
 *  - the canonical system fields (the fixed columns written straight into the
 *    students / teachers / fee_structures / … tables), and
 *  - the school's OWN EAV fields for that entity's bucket(s) — the fields the
 *    principal configured in Settings → Structure Builder, plus the seeded
 *    system EAV fields (Blood Group, Nationality, Previous School, …).
 *
 * Import Studio previously hard-coded its catalogs on the client and never
 * read `fields`, so a school's custom fields could never be imported. Every
 * surface that imports (Bulk Operations, section uploads, Onboarding) now
 * drives its mapping UI from this query.
 */

export type ImportKind =
  | "students"
  | "staff"
  | "fees"
  | "attendance"
  | "fee-payments"
  | "subjects"
  | "classes"
  | "terms";

export type CatalogField = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
  // Present only for school EAV fields (seeded system + custom).
  fieldId?: string;
  sectionId?: string;
  sectionName?: string;
  moduleName?: string;
  bucket?: string;
  inputType?: string;
  options?: string[];
};

type SystemField = { key: string; label: string; required: boolean; aliases: string[] };

// ── Canonical system fields per kind ─────────────────────────────────
// These match the write path keys in convex/imports.ts and the row builder
// keys in Import Studio (buildStudentRow / buildStaffRow / …). A school's
// EAV field is only importable when it does NOT already have a system column
// (its aliases never collide with these keys — see `isSystemBacked`).

const SYSTEM_FIELDS: Record<ImportKind, SystemField[]> = {
  students: [
    { key: "fullName", label: "Full Name", required: false, aliases: ["full name", "fullname", "student name", "name", "learner name"] },
    { key: "firstName", label: "First Name", required: false, aliases: ["first name", "firstname", "fname", "f name", "given name"] },
    { key: "lastName", label: "Last Name", required: false, aliases: ["last name", "lastname", "lname", "surname", "family name"] },
    { key: "admNo", label: "Admission No", required: false, aliases: ["adm no", "admission no", "admission number", "admno", "reg no", "registration number", "student no", "student number", "adm", "index no"] },
    { key: "className", label: "Class", required: true, aliases: ["class", "class name", "grade", "form", "current class"] },
    { key: "streamName", label: "Stream", required: false, aliases: ["stream", "stream name"] },
    // Phase 18: gender / DOB / admissionDate are no longer system columns —
    // they live in the school's OWN EAV fields (the seeded Gender, Date of
    // Birth, Admission Date fields), so a school imports them as EAV fields.
    { key: "status", label: "Status", required: false, aliases: ["status", "student status"] },
    // Guardian fields stay as system import keys because they feed the
    // guardian ENTITY system (guardians + guardian_links) — the students
    // table itself carries no guardian columns.
    { key: "guardianName", label: "Guardian Name", required: false, aliases: ["guardian name", "parent name", "parent", "guardian", "parent/guardian", "guardians name"] },
    { key: "guardianRelation", label: "Relationship", required: false, aliases: ["relationship", "relation", "guardian relation"] },
    { key: "guardianPhone", label: "Guardian Phone", required: false, aliases: ["guardian phone", "parent phone", "parent phone number", "guardian phone number", "parent mobile", "mobile number", "phone", "phone number", "tel", "telephone", "contact", "mobile"] },
    { key: "guardianPhone2", label: "Alternative Phone", required: false, aliases: ["alternative phone", "second phone", "phone 2", "other phone", "guardian phone 2", "phone 2nd"] },
    { key: "guardianEmail", label: "Guardian Email", required: false, aliases: ["guardian email", "parent email", "email", "email address"] },
    { key: "homeAddress", label: "Home Address", required: false, aliases: ["home address", "address", "residence", "location"] },
    { key: "emergencyName", label: "Emergency Contact", required: false, aliases: ["emergency contact", "emergency name", "next of kin"] },
    { key: "emergencyPhone", label: "Emergency Phone", required: false, aliases: ["emergency phone", "emergency contact phone", "emergency number"] },
  ],
  staff: [
    { key: "staffName", label: "Staff Name", required: true, aliases: ["teacher name", "staff name", "teacher", "staff", "employee name", "employee", "full name", "name"] },
    { key: "staffNo", label: "Staff / TSC No", required: false, aliases: ["staff no", "staff number", "employee no", "employee number", "tsc no", "tsc", "payroll no", "emp no", "staff id"] },
    { key: "role", label: "Role / Job Title", required: false, aliases: ["role", "job title", "designation", "position", "title", "occupation", "job"] },
    { key: "department", label: "Department", required: false, aliases: ["department", "faculty", "subject department"] },
    { key: "staffPhone", label: "Staff Phone", required: false, aliases: ["phone", "phone number", "mobile", "tel", "telephone", "contact"] },
    { key: "staffEmail", label: "Staff Email", required: false, aliases: ["email", "email address", "work email"] },
  ],
  fees: [
    { key: "feeClassName", label: "Class", required: true, aliases: ["class", "class name", "grade", "form", "level", "class/grade"] },
    { key: "feeStreamName", label: "Stream", required: false, aliases: ["stream", "stream name"] },
    { key: "feeAmount", label: "Fee Amount", required: true, aliases: ["fee", "fees", "amount", "amount ksh", "school fees", "tuition", "fee amount", "fees ksh"] },
  ],
  attendance: [
    { key: "admNo", label: "Admission No", required: true, aliases: ["adm no", "admission no", "admission number", "admno", "reg no", "student no", "student number", "index no"] },
    { key: "studentName", label: "Student Name", required: false, aliases: ["student name", "full name", "name", "learner name", "pupil name"] },
    { key: "attendStatus", label: "Attendance Status", required: true, aliases: ["attendance", "status", "attendance status", "present/absent", "mark", "present", "absent"] },
    { key: "date", label: "Date", required: false, aliases: ["date", "attendance date", "day", "class date"] },
    { key: "period", label: "Period No", required: false, aliases: ["period", "period no", "period number", "lesson", "period #"] },
    { key: "subject", label: "Subject", required: false, aliases: ["subject", "subject name"] },
  ],
  "fee-payments": [
    { key: "admNo", label: "Admission No", required: false, aliases: ["adm no", "admission no", "admission number", "admno", "reg no", "student no", "student number", "index no"] },
    { key: "studentName", label: "Student Name", required: false, aliases: ["student name", "full name", "name", "learner name", "pupil name"] },
    { key: "amountPaid", label: "Amount Paid", required: true, aliases: ["amount paid", "paid", "payment", "amount", "amount ksh", "paid amount", "received", "receipt amount", "fee paid"] },
    { key: "balance", label: "Balance", required: false, aliases: ["balance", "bal", "outstanding", "arrears", "amount due", "balance b/f", "credit"] },
    { key: "method", label: "Payment Method", required: false, aliases: ["method", "payment method", "mode", "payment mode", "means of payment", "paid via"] },
    { key: "date", label: "Payment Date", required: false, aliases: ["date", "payment date", "transaction date", "received on", "date paid"] },
    { key: "reference", label: "Receipt / Ref", required: false, aliases: ["reference", "ref", "receipt no", "receipt number", "receipt", "transaction id", "trans id", "mpesa code", "mpesa receipt"] },
  ],
  subjects: [
    { key: "subjectName", label: "Subject Name", required: true, aliases: ["subject", "subject name", "course", "course name", "subject title"] },
    { key: "subjectCode", label: "Subject Code", required: false, aliases: ["subject code", "code", "course code", "subject no"] },
    { key: "level", label: "Level", required: false, aliases: ["level", "stage", "class", "grade", "category"] },
  ],
  classes: [
    { key: "className", label: "Class", required: true, aliases: ["class", "class name", "grade", "form", "level"] },
    { key: "streamName", label: "Stream", required: false, aliases: ["stream", "stream name", "arm", "section"] },
  ],
  terms: [
    { key: "termName", label: "Term Name", required: true, aliases: ["term", "term name", "semester", "session", "period"] },
    { key: "termYear", label: "Year", required: true, aliases: ["year", "academic year", "school year"] },
    { key: "startDate", label: "Start Date", required: false, aliases: ["start date", "starts", "begin date", "opens", "term start"] },
    { key: "endDate", label: "End Date", required: false, aliases: ["end date", "ends", "close date", "closes", "term end"] },
  ],
};

// Which EAV buckets a kind's records live in. Students → learner bucket.
// Staff → teaching or non-teaching depending on the imported category, so
// the catalog offers fields from both buckets.
const KIND_BUCKETS: Partial<Record<ImportKind, string[]>> = {
  students: ["learner"],
  staff: ["teaching_staff", "non_teaching_staff"],
};

const IMPORTABLE_KINDS: ImportKind[] = [
  "students",
  "staff",
  "fees",
  "attendance",
  "fee-payments",
  "subjects",
  "classes",
  "terms",
];

/**
 * The school's import catalog. Returns every importable kind with its system
 * fields plus the school's own EAV fields (custom + seeded system fields that
 * aren't already covered by a system column).
 */
export const getImportCatalog = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args): Promise<
    Record<ImportKind, { bucket?: string[]; systemFields: CatalogField[]; eavFields: CatalogField[] }>
  > => {
    await requireSchoolMembership(ctx, args.schoolId);

    const [modules, sections, fields] = await Promise.all([
      ctx.db.query("modules").withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId)).take(200),
      ctx.db.query("sections").withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId)).take(500),
      ctx.db.query("fields").withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId)).take(500),
    ]);

    const moduleNameById = new Map<string, string>();
    for (const m of modules) moduleNameById.set(m._id, m.name);

    const sectionById = new Map<string, Doc<"sections">>();
    for (const s of sections) sectionById.set(s._id, s);

    // A repeatable section (allergies, medications, incident logs, …) stores
    // values keyed by fieldValues.instanceId. A flat column can't name the
    // instance it belongs to, so repeatable fields are excluded from import.
    const isInRepeatableSection = (sectionId: string): boolean => {
      let cur: Doc<"sections"> | undefined = sectionById.get(sectionId);
      const seen = new Set<string>();
      while (cur && !seen.has(cur._id)) {
        seen.add(cur._id);
        if (cur.isRepeatable) return true;
        cur = cur.parentId ? sectionById.get(cur.parentId) : undefined;
      }
      return false;
    };

    const systemBackedKeys = new Set<string>();
    for (const kind of IMPORTABLE_KINDS) {
      for (const f of SYSTEM_FIELDS[kind]) systemBackedKeys.add(f.key);
    }

    // Group every importable EAV field by bucket.
    const eavByBucket = new Map<string, CatalogField[]>();
    for (const field of fields) {
      if (!field.isEnabled || field.inputType === "file") continue;
      const section = sectionById.get(field.sectionId);
      if (!section) continue;
      // Sections belong to a module which owns the bucket.
      const module = modules.find((m) => m._id === section.moduleId);
      const bucket = module?.bucket;
      if (!bucket || bucket === "platform") continue;
      if (isInRepeatableSection(field.sectionId)) continue;
      // The seeded EAV fields that alias a system column (FirstName, admNo,
      // gender, DOB, guardian phone, staffNo…) are written to the system
      // column, NOT duplicated into EAV. Skip them from the import list.
      if (field.aliases.some((a) => systemBackedKeys.has(a))) continue;

      const key = `eav:${field._id}`;
      const list = eavByBucket.get(bucket) ?? [];
      list.push({
        key,
        label: field.name,
        required: field.isRequired ?? false,
        aliases: field.aliases ?? [],
        fieldId: field._id,
        sectionId: section._id,
        sectionName: section.name,
        moduleName: moduleNameById.get(section.moduleId) ?? "",
        bucket,
        inputType: field.inputType,
        options: field.options,
      });
      eavByBucket.set(bucket, list);
    }

    const result = {} as Record<
      ImportKind,
      { bucket?: string[]; systemFields: CatalogField[]; eavFields: CatalogField[] }
    >;
    for (const kind of IMPORTABLE_KINDS) {
      const buckets = KIND_BUCKETS[kind];
      const eavFields: CatalogField[] = [];
      for (const bucket of buckets ?? []) {
        eavFields.push(...(eavByBucket.get(bucket) ?? []));
      }
      // Deterministic order: group by module → section → field name.
      eavFields.sort((a, b) =>
        `${a.moduleName ?? ""}|${a.sectionName ?? ""}|${a.label}`.localeCompare(
          `${b.moduleName ?? ""}|${b.sectionName ?? ""}|${b.label}`
        )
      );
      result[kind] = {
        bucket: buckets,
        systemFields: SYSTEM_FIELDS[kind].map((f) => ({ ...f })),
        eavFields,
      };
    }
    return result;
  },
});
