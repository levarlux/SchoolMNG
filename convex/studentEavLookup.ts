/**
 * Bulk student → EAV value lookup (Phase 18).
 *
 * After the students table was stripped to its typed semantic core, fields
 * like Gender, Date of Birth, Admission Date, guardian & contact details live
 * in the school's OWN EAV fields. Readers (exports, reports, PDFs, the marks
 * importer's identity engine) that previously read these off the students doc
 * now join them through records → fieldValues, matching fields by their
 * school-defined aliases (never by hard-coded column names).
 *
 * Matching is by `field.aliases`: the seed fields carry the canonical alias
 * (gender, dateOfBirth, admissionDate, guardianName, guardianPhone, …) and a
 * school renaming a field keeps the alias, so lookups survive label changes.
 */
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type DbCtx = Pick<QueryCtx, "db">;

/**
 * Load the requested EAV values for every student in a school.
 * Returns `Map<studentId, Partial<Record<alias, string>>>`.
 */
export async function loadStudentEavValues(
  ctx: DbCtx,
  schoolId: Id<"schools">,
  aliases: string[]
): Promise<Map<string, Record<string, string>>> {
  const aliasSet = new Set(aliases);
  const result = new Map<string, Record<string, string>>();

  // Fields: match on alias. Only enabled, non-file fields are considered.
  const fields = await ctx.db
    .query("fields")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(1000);

  const fieldIdByAlias = new Map<string, Id<"fields">>();
  for (const f of fields) {
    if (!f.isEnabled || f.inputType === "file") continue;
    for (const a of f.aliases ?? []) {
      if (aliasSet.has(a) && !fieldIdByAlias.has(a)) {
        fieldIdByAlias.set(a, f._id);
      }
    }
  }
  if (fieldIdByAlias.size === 0) return result;

  // Records for the learner bucket, keyed by studentId.
  const records = await ctx.db
    .query("records")
    .withIndex("by_schoolId_bucket", (q) =>
      q.eq("schoolId", schoolId).eq("bucket", "learner")
    )
    .take(5000);

  const recordIdToStudentId = new Map<string, string>();
  for (const r of records) {
    if (r.studentId) recordIdToStudentId.set(r._id, r.studentId);
  }
  if (recordIdToStudentId.size === 0) return result;

  // Field values for those records.
  const wantedFieldIds = new Set(fieldIdByAlias.values());
  const fieldValues = await ctx.db
    .query("fieldValues")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .take(10000);

  for (const fv of fieldValues) {
    const studentId = recordIdToStudentId.get(fv.recordId);
    if (!studentId || !wantedFieldIds.has(fv.fieldId)) continue;
    const alias = [...fieldIdByAlias.entries()].find(([, id]) => id === fv.fieldId)?.[0];
    if (!alias) continue;
    if (!result.has(studentId)) result.set(studentId, {});
    result.get(studentId)![alias] = fv.value;
  }

  return result;
}
