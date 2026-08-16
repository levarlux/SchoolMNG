/**
 * Calculation Engine
 *
 * Composable, deterministic math primitives that the AI agent can chain
 * together based on natural-language requests. AI never performs computation
 * itself — it only translates user requests into structured instructions
 * that this engine executes.
 *
 * Primitives: filter, group, sum, average, count, min/max, rank,
 * percentage, trend, standardDeviation, ratio
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSchoolMembership } from "./helpers";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// ── Helpers ───────────────────────────────────────────────────────────

/** Resolve the current term for a school, or use the provided termId. */
async function resolveCurrentTerm(
  ctx: { db: { query: Function } },
  schoolId: Id<"schools">,
  termId?: Id<"terms">
): Promise<Id<"terms">> {
  if (termId) return termId;
  const term = await ctx.db
    .query("terms")
    .withIndex("by_current", (q: any) => q.eq("schoolId", schoolId).eq("isCurrent", true))
    .first();
  if (!term) {
    throw new Error("No current term found for this school");
  }
  return term._id;
}

/**
 * Compute total expected fees: sum of fee_structure amounts for every
 * student whose class has an active fee structure (matching stream if defined).
 */
function computeFeeExpected(
  structures: Doc<"fee_structures">[],
  students: Doc<"students">[]
): number {
  const classesWithFees = new Set(structures.map((s) => s.classId));
  let expected = 0;
  for (const s of students) {
    if (!classesWithFees.has(s.classId)) continue;
    const structure = structures.find(
      (fs) => fs.classId === s.classId && (!fs.streamId || fs.streamId === s.streamId)
    );
    if (structure) expected += structure.amount;
  }
  return expected;
}

// ── Types ───────────────────────────────────────────────────────────

interface DataRecord {
  [key: string]: unknown;
}

type SortDirection = "asc" | "desc";

interface RankOptions {
  field: string;
  direction?: SortDirection;
  limit?: number;
}

interface TrendOptions {
  dateField: string;
  valueField: string;
  groupBy?: string;
  periods?: number;
}

// ── Primitive Functions ─────────────────────────────────────────────

/**
 * Filter records by a condition.
 */
export function filter(
  records: DataRecord[],
  field: string,
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains",
  value: unknown
): DataRecord[] {
  return records.filter((r) => {
    const v = r[field];
    switch (operator) {
      case "eq": return v === value;
      case "neq": return v !== value;
      case "gt": return (v as number) > (value as number);
      case "gte": return (v as number) >= (value as number);
      case "lt": return (v as number) < (value as number);
      case "lte": return (v as number) <= (value as number);
      case "in": return Array.isArray(value) && value.includes(v);
      case "contains": return String(v).toLowerCase().includes(String(value).toLowerCase());
      default: return true;
    }
  });
}

/**
 * Group records by a field.
 */
export function groupBy(
  records: DataRecord[],
  field: string
): Record<string, DataRecord[]> {
  const result: Record<string, DataRecord[]> = {};
  for (const r of records) {
    const key = String(r[field] ?? "unknown");
    if (!result[key]) result[key] = [];
    result[key].push(r);
  }
  return result;
}

/**
 * Sum a numeric field.
 */
export function sum(records: DataRecord[], field: string): number {
  return records.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
}

/**
 * Calculate average of a numeric field.
 */
export function average(records: DataRecord[], field: string): number {
  if (records.length === 0) return 0;
  return sum(records, field) / records.length;
}

/**
 * Count records.
 */
export function count(records: DataRecord[]): number {
  return records.length;
}

/**
 * Find minimum value.
 */
export function min(records: DataRecord[], field: string): number | undefined {
  if (records.length === 0) return undefined;
  return Math.min(...records.map((r) => Number(r[field]) || 0));
}

/**
 * Find maximum value.
 */
export function max(records: DataRecord[], field: string): number | undefined {
  if (records.length === 0) return undefined;
  return Math.max(...records.map((r) => Number(r[field]) || 0));
}

/**
 * Rank records by a field.
 */
export function rank(
  records: DataRecord[],
  options: RankOptions
): DataRecord[] {
  const { field, direction = "desc", limit } = options;
  const sorted = [...records].sort((a, b) => {
    const aVal = Number(a[field]) || 0;
    const bVal = Number(b[field]) || 0;
    return direction === "desc" ? bVal - aVal : aVal - bVal;
  });
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Calculate percentage.
 */
export function percentage(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Calculate trend over time periods.
 */
export function trend(
  records: DataRecord[],
  options: TrendOptions
): Array<{ period: string; value: number; change?: number }> {
  const { dateField, valueField, periods = 12 } = options;
  
  // Group by month/year
  const grouped = new Map<string, number[]>();
  for (const r of records) {
    const date = new Date(r[dateField] as number);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(Number(r[valueField]) || 0);
  }
  
  // Calculate averages per period
  const result: Array<{ period: string; value: number; change?: number }> = [];
  const sortedKeys = [...grouped.keys()].sort().slice(-periods);
  
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const values = grouped.get(key)!;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    
    result.push({
      period: key,
      value: Math.round(avg * 100) / 100,
      change: i > 0
        ? Math.round(((avg - (grouped.get(sortedKeys[i - 1])?.reduce((a, b) => a + b, 0) ?? 0) / (grouped.get(sortedKeys[i - 1])?.length ?? 1)) / ((grouped.get(sortedKeys[i - 1])?.reduce((a, b) => a + b, 0) ?? 1) / (grouped.get(sortedKeys[i - 1])?.length ?? 1))) * 100)
        : undefined,
    });
  }
  
  return result;
}

/**
 * Calculate standard deviation.
 */
export function standardDeviation(records: DataRecord[], field: string): number {
  if (records.length === 0) return 0;
  const avg = average(records, field);
  const squaredDiffs = records.map((r) => {
    const diff = (Number(r[field]) || 0) - avg;
    return diff * diff;
  });
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / records.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Calculate ratio between two fields.
 */
export function ratio(
  records: DataRecord[],
  numeratorField: string,
  denominatorField: string
): number {
  const num = sum(records, numeratorField);
  const den = sum(records, denominatorField);
  if (den === 0) return 0;
  return Math.round((num / den) * 100) / 100;
}

// ── Convex Queries ──────────────────────────────────────────────────

/**
 * Execute a calculation query against student data.
 * The AI agent calls this with a structured instruction.
 */
export const calculateStudentStats = query({
  args: {
    schoolId: v.id("schools"),
    operation: v.union(
      v.literal("count"),
      v.literal("sum"),
      v.literal("average"),
      v.literal("min"),
      v.literal("max"),
      v.literal("stddev"),
      v.literal("rank"),
      v.literal("trend"),
    ),
    field: v.optional(v.string()),
    filterField: v.optional(v.string()),
    filterValue: v.optional(v.any()),
    rankDirection: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    rankLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    
    const students = await ctx.db
      .query("students")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(10000);
    
    // Convert to DataRecord format
    // Phase 18: gender is a school-defined EAV field — not part of the typed
    // semantic core — so it's not surfaced as a system DataRecord field here.
    const records: DataRecord[] = students.map((s) => ({
      _id: s._id,
      firstName: s.firstName,
      lastName: s.lastName,
      admNo: s.admNo,
      status: s.status,
    }));
    
    // Apply filter if specified
    let filtered = records;
    if (args.filterField && args.filterValue !== undefined) {
      filtered = filter(records, args.filterField, "eq", args.filterValue);
    }
    
    // Execute operation
    switch (args.operation) {
      case "count":
        return { result: count(filtered), type: "number" };
      case "sum":
        return { result: args.field ? sum(filtered, args.field) : 0, type: "number" };
      case "average":
        return { result: args.field ? average(filtered, args.field) : 0, type: "number" };
      case "min":
        return { result: args.field ? min(filtered, args.field) : undefined, type: "number" };
      case "max":
        return { result: args.field ? max(filtered, args.field) : undefined, type: "number" };
      case "stddev":
        return { result: args.field ? standardDeviation(filtered, args.field) : 0, type: "number" };
      case "rank":
        return {
          result: args.field
            ? rank(filtered, {
                field: args.field,
                direction: args.rankDirection ?? "desc",
                limit: args.rankLimit ?? 10,
              })
            : [],
          type: "array",
        };
      case "trend":
        return { result: [], type: "trend", message: "Trend requires date field" };
      default:
        return { result: null, type: "unknown" };
    }
  },
});

/**
 * Execute a calculation query against fee payment data.
 */
export const calculateFeeStats = query({
  args: {
    schoolId: v.id("schools"),
    termId: v.optional(v.id("terms")),
    operation: v.union(
      v.literal("total_collected"),
      v.literal("total_expected"),
      v.literal("collection_rate"),
      v.literal("average_payment"),
      v.literal("top_payers"),
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    
    const payments = args.termId
      ? await ctx.db
          .query("fee_payments")
          .withIndex("by_term", (q) =>
            q.eq("schoolId", args.schoolId).eq("termId", args.termId!)
          )
          .take(10000)
      : await ctx.db
          .query("fee_payments")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
          .take(10000);
    
    const records: DataRecord[] = payments.map((p) => ({
      _id: p._id,
      amount: p.amount,
      studentId: p.studentId,
      method: p.method,
      receivedAt: p.receivedAt,
    }));
    
    switch (args.operation) {
      case "total_collected":
        return { result: sum(records, "amount"), type: "number" };
      case "total_expected": {
        // P2#14: Check EAV config first — if useEavForFees is enabled,
        // compute expected from EAV fieldValues instead of fee_structures.
        const eavResult = await ctx.runQuery(internal.financeConfig.computeEavExpectedFees, {
          schoolId: args.schoolId,
        });
        if (eavResult) {
          return { result: eavResult.totalExpected, type: "number", source: "eav" };
        }
        // Fallback to hardcoded fee_structures
        const termId = await resolveCurrentTerm(ctx, args.schoolId, args.termId);
        const [structures, students] = await Promise.all([
          ctx.db
            .query("fee_structures")
            .withIndex("by_term", (q) =>
              q.eq("schoolId", args.schoolId).eq("termId", termId)
            )
            .take(500),
          ctx.db
            .query("students")
            .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
            .take(10000),
        ]);
        const expected = computeFeeExpected(structures, students);
        return { result: expected, type: "number", source: "fee_structures" };
      }
      case "collection_rate": {
        const collected = sum(records, "amount");
        // P2#14: Check EAV config first
        const eavResult = await ctx.runQuery(internal.financeConfig.computeEavExpectedFees, {
          schoolId: args.schoolId,
        });
        if (eavResult) {
          return {
            result: percentage(collected, eavResult.totalExpected),
            type: "percentage",
            source: "eav",
          };
        }
        // Fallback to hardcoded fee_structures
        const termId = await resolveCurrentTerm(ctx, args.schoolId, args.termId);
        const [structures, students] = await Promise.all([
          ctx.db
            .query("fee_structures")
            .withIndex("by_term", (q) =>
              q.eq("schoolId", args.schoolId).eq("termId", termId)
            )
            .take(500),
          ctx.db
            .query("students")
            .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
            .take(10000),
        ]);
        const expected = computeFeeExpected(structures, students);
        return {
          result: percentage(collected, expected),
          type: "percentage",
          source: "fee_structures",
        };
      }
      case "average_payment":
        return { result: average(records, "amount"), type: "number" };
      case "top_payers": {
        const byStudent = groupBy(records, "studentId");
        const totals = Object.entries(byStudent).map(([id, recs]) => ({
          studentId: id,
          total: sum(recs, "amount"),
        }));
        return {
          result: rank(totals as DataRecord[], { field: "total", limit: 10 }),
          type: "array",
        };
      }
      default:
        return { result: null, type: "unknown" };
    }
  },
});
