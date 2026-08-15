/**
 * School Blueprint (flexibility phase 1)
 *
 * Per-school configuration for how THIS school works, stored as data instead
 * of hardcoded conventions:
 *  - Admission / staff number conventions (prefix + pattern + counters)
 *  - Term naming ("Term {n}", "Semester {n}", …)
 *  - Grading scale (bands → grade → comment)
 *
 * Every school behaves exactly as before until the principal customises its
 * blueprint: reads fall back to DEFAULT_BLUEPRINT, and number generation
 * without a saved blueprint keeps the original timestamp-based scheme.
 *
 * Number patterns support the tokens: {prefix}, {year}, {seq}, {timestamp}.
 * The {seq} counter lives on the blueprint doc and is bumped inside the same
 * transaction that issues the number, so concurrent inserts never collide.
 */
import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requirePrincipal, requireSchoolMembership } from "./helpers";

export type GradingBand = {
  min: number;
  max: number;
  grade: string;
  comment?: string;
};

export type BlueprintShape = {
  admissionPrefix: string;
  admissionPattern: string;
  admissionCounter: number;
  staffPrefix: string;
  staffPattern: string;
  staffCounter: number;
  termNaming: string;
  termsPerYear: number;
  gradingScale: GradingBand[];
};

// Original auto-numbering: ADM-<base36 timestamp>-<row>. Kept as the default
// pattern so schools that never touch a blueprint see identical numbers.
export const DEFAULT_ADMISSION_PATTERN = "{prefix}-{timestamp}-{seq}";
export const DEFAULT_STAFF_PATTERN = "{prefix}-{timestamp}-{seq}";

export const DEFAULT_BLUEPRINT: BlueprintShape = {
  admissionPrefix: "ADM",
  admissionPattern: DEFAULT_ADMISSION_PATTERN,
  admissionCounter: 1,
  staffPrefix: "STF",
  staffPattern: DEFAULT_STAFF_PATTERN,
  staffCounter: 1,
  termNaming: "Term {n}",
  termsPerYear: 3,
  gradingScale: [
    { min: 80, max: 100, grade: "A", comment: "Excellent" },
    { min: 70, max: 79, grade: "B", comment: "Very good" },
    { min: 60, max: 69, grade: "C", comment: "Good" },
    { min: 50, max: 59, grade: "D", comment: "Fair" },
    { min: 40, max: 49, grade: "E", comment: "Below average" },
    { min: 0, max: 39, grade: "F", comment: "Fail" },
  ],
};

// ── Reading ─────────────────────────────────────────────────────────

// Reader context works everywhere (queries and mutations); the number
// generators additionally need the writer (they bump counters).
type ReaderCtx = { db: QueryCtx["db"] };
type WriterCtx = { db: MutationCtx["db"] };

/** Read the blueprint doc, or null when the school never saved one. */
export async function readBlueprint(
  ctx: ReaderCtx,
  schoolId: Id<"schools">
): Promise<Doc<"school_blueprints"> | null> {
  return await ctx.db
    .query("school_blueprints")
    .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
    .first();
}

/** Fill a saved doc up with defaults so callers always get every field. */
export async function getBlueprintOrDefaults(
  ctx: ReaderCtx,
  schoolId: Id<"schools">
): Promise<BlueprintShape> {
  const doc = await readBlueprint(ctx, schoolId);
  if (!doc) return { ...DEFAULT_BLUEPRINT };
  return {
    admissionPrefix: doc.admissionPrefix,
    admissionPattern: doc.admissionPattern,
    admissionCounter: doc.admissionCounter,
    staffPrefix: doc.staffPrefix,
    staffPattern: doc.staffPattern,
    staffCounter: doc.staffCounter,
    termNaming: doc.termNaming,
    termsPerYear: doc.termsPerYear,
    gradingScale: doc.gradingScale,
  };
}

export const getBlueprint = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await getBlueprintOrDefaults(ctx, schoolId);
  },
});

// ── Number generation ───────────────────────────────────────────────

/** Format a sequence number from a pattern + tokens. */
export function formatNumber(
  pattern: string,
  prefix: string,
  seq: number,
  now = Date.now()
): string {
  const year = new Date(now).getFullYear();
  const timestamp = now.toString(36).toUpperCase();
  const padded = String(seq).padStart(4, "0");
  return pattern
    .replaceAll("{prefix}", prefix)
    .replaceAll("{year}", String(year))
    .replaceAll("{seq}", padded)
    .replaceAll("{timestamp}", timestamp);
}

/**
 * Reserve the next admission number for a school and bump its counter.
 * Call inside the same mutation that inserts the student so the bump is
 * transactional. Without a saved blueprint, falls back to the original
 * ADM-<timestamp>-<row> scheme (row = 1-based hint from the caller).
 */
export async function nextAdmissionNumberInternal(
  ctx: WriterCtx,
  schoolId: Id<"schools">,
  rowHint = 1,
  now = Date.now()
): Promise<string> {
  const doc = await readBlueprint(ctx, schoolId);
  if (doc) {
    const seq = doc.admissionCounter;
    await ctx.db.patch(doc._id, { admissionCounter: seq + 1 });
    return formatNumber(doc.admissionPattern, doc.admissionPrefix, seq, now);
  }
  return `ADM-${now.toString(36).toUpperCase()}-${String(rowHint).padStart(3, "0")}`;
}

/** Reserve the next staff number; see nextAdmissionNumberInternal. */
export async function nextStaffNumberInternal(
  ctx: WriterCtx,
  schoolId: Id<"schools">,
  rowHint = 1,
  now = Date.now()
): Promise<string> {
  const doc = await readBlueprint(ctx, schoolId);
  if (doc) {
    const seq = doc.staffCounter;
    await ctx.db.patch(doc._id, { staffCounter: seq + 1 });
    return formatNumber(doc.staffPattern, doc.staffPrefix, seq, now);
  }
  return `STF-${now.toString(36).toUpperCase()}-${String(rowHint).padStart(3, "0")}`;
}

/** Preview the next admission number without reserving it. */
export const suggestAdmissionNumber = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const bp = await getBlueprintOrDefaults(ctx, schoolId);
    return formatNumber(bp.admissionPattern, bp.admissionPrefix, bp.admissionCounter);
  },
});

/** Preview the next staff number without reserving it. */
export const suggestStaffNumber = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    const bp = await getBlueprintOrDefaults(ctx, schoolId);
    return formatNumber(bp.staffPattern, bp.staffPrefix, bp.staffCounter);
  },
});

// ── Saving ──────────────────────────────────────────────────────────

export const saveBlueprint = mutation({
  args: {
    schoolId: v.id("schools"),
    admissionPrefix: v.optional(v.string()),
    admissionPattern: v.optional(v.string()),
    staffPrefix: v.optional(v.string()),
    staffPattern: v.optional(v.string()),
    termNaming: v.optional(v.string()),
    termsPerYear: v.optional(v.number()),
    gradingScale: v.optional(
      v.array(
        v.object({
          min: v.number(),
          max: v.number(),
          grade: v.string(),
          comment: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const existing = await readBlueprint(ctx, args.schoolId);
    const base = existing
      ? await getBlueprintOrDefaults(ctx, args.schoolId)
      : { ...DEFAULT_BLUEPRINT };

    const updates = {
      admissionPrefix: args.admissionPrefix?.trim() || base.admissionPrefix,
      admissionPattern: args.admissionPattern?.trim() || base.admissionPattern,
      staffPrefix: args.staffPrefix?.trim() || base.staffPrefix,
      staffPattern: args.staffPattern?.trim() || base.staffPattern,
      termNaming: args.termNaming?.trim() || base.termNaming,
      termsPerYear: args.termsPerYear ?? base.termsPerYear,
      gradingScale: args.gradingScale ?? base.gradingScale,
    };

    if (existing) {
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }
    return await ctx.db.insert("school_blueprints", {
      schoolId: args.schoolId,
      admissionCounter: 1,
      staffCounter: 1,
      ...updates,
    });
  },
});

// ── Grading ─────────────────────────────────────────────────────────

/** Resolve a mark against a blueprint's grading scale. */
export function gradeForMarks(
  scale: GradingBand[],
  marks: number
): { grade: string; comment?: string } | null {
  const band = scale.find((b) => marks >= b.min && marks <= b.max);
  return band ? { grade: band.grade, comment: band.comment } : null;
}

/** Render a term name from the school's naming ("Term 1", "Semester 2", …). */
export function formatTermName(termNaming: string, n: number): string {
  return termNaming.includes("{n}") ? termNaming.replaceAll("{n}", String(n)) : termNaming;
}
