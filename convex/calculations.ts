/**
 * Calculation Engine — pure functions, deterministic, no AI.
 * Used by all modules for sums, averages, rankings, trends, and rates.
 */

/** Calculate the average of a numeric array. Returns 0 for empty arrays. */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Calculate the sum of a numeric array. */
export function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

/** Calculate the median of a numeric array. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Calculate standard deviation of a numeric array. */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

/** Calculate percentage. */
export function percentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/** Calculate attendance rate (present + excused) / total. */
export function attendanceRate(present: number, late: number, excused: number, total: number): number {
  if (total === 0) return 0;
  return percentage(present + late + excused, total);
}

/** Calculate fee collection rate (collected / expected). */
export function feeCollectionRate(collected: number, expected: number): number {
  return percentage(collected, expected);
}

/** Grade a mark based on 8-point CBC scale (Kenya). */
export function gradeCBC(marks: number): string {
  if (marks >= 80) return "A";
  if (marks >= 70) return "B";
  if (marks >= 60) return "C";
  if (marks >= 50) return "D";
  if (marks >= 40) return "E";
  if (marks >= 30) return "F";
  return "G";
}

/** Grade point for a letter grade. */
export function gradePoint(grade: string): number {
  const map: Record<string, number> = {
    A: 12, B: 11, C: 10, D: 9, E: 8, F: 7, G: 6,
  };
  return map[grade.toUpperCase()] ?? 0;
}

/** Calculate mean grade point average from marks array. */
export function meanGPA(marks: number[]): number {
  const gradePoints = marks.map((m) => gradePoint(gradeCBC(m)));
  return average(gradePoints);
}

// ── Rankings ──────────────────────────────────────────────────────

interface RankedStudent {
  id: string;
  average: number;
}

interface RankedResult {
  id: string;
  rank: number;
  average: number;
}

/** Rank students by average (descending). Ties get the same rank. */
export function rankStudents(students: RankedStudent[]): RankedResult[] {
  const sorted = [...students].sort((a, b) => b.average - a.average);
  const result: RankedResult[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].average < sorted[i - 1].average) {
      currentRank = i + 1;
    }
    result.push({
      id: sorted[i].id,
      rank: currentRank,
      average: sorted[i].average,
    });
  }
  return result;
}

/** Rank students within a class by their exam marks. */
export function rankByMarks(
  marks: { studentId: string; totalMarks: number }[]
): { studentId: string; rank: number; totalMarks: number }[] {
  const sorted = [...marks].sort((a, b) => b.totalMarks - a.totalMarks);
  const result: { studentId: string; rank: number; totalMarks: number }[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].totalMarks < sorted[i - 1].totalMarks) {
      currentRank = i + 1;
    }
    result.push({
      studentId: sorted[i].studentId,
      rank: currentRank,
      totalMarks: sorted[i].totalMarks,
    });
  }
  return result;
}

// ── Trends ────────────────────────────────────────────────────────

interface TrendPoint {
  period: string;
  value: number;
}

interface TrendResult {
  direction: "up" | "down" | "stable";
  change: number; // percentage change from first to last
  points: TrendPoint[];
}

/** Calculate trend direction and magnitude from time-series data. */
export function calculateTrend(values: TrendPoint[]): TrendResult {
  if (values.length < 2) {
    return { direction: "stable", change: 0, points: values };
  }

  const sorted = [...values].sort((a, b) => {
    // Simple string comparison — works for "Term 1", "Term 2", etc.
    return a.period.localeCompare(b.period);
  });

  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;

  const direction: "up" | "down" | "stable" =
    Math.abs(change) < 5 ? "stable" : change > 0 ? "up" : "down";

  return { direction, change: Math.round(change * 100) / 100, points: sorted };
}

// ── Class/School Statistics ───────────────────────────────────────

interface ClassStats {
  classId: string;
  className: string;
  studentCount: number;
  averageMarks: number;
  highestMark: number;
  lowestMark: number;
  passRate: number; // percentage with marks >= 50
}

/** Calculate statistics for a class given student marks. */
export function classStatistics(
  classId: string,
  className: string,
  marks: number[]
): ClassStats {
  const avg = average(marks);
  const highest = marks.length > 0 ? Math.max(...marks) : 0;
  const lowest = marks.length > 0 ? Math.min(...marks) : 0;
  const passCount = marks.filter((m) => m >= 50).length;

  return {
    classId,
    className,
    studentCount: marks.length,
    averageMarks: Math.round(avg * 100) / 100,
    highestMark: highest,
    lowestMark: lowest,
    passRate: percentage(passCount, marks.length),
  };
}

/** Calculate school-wide exam summary. */
export function schoolExamSummary(
  classStats: ClassStats[]
): {
  totalStudents: number;
  overallAverage: number;
  overallPassRate: number;
  bestClass: string;
  worstClass: string;
} {
  const allAverages = classStats.map((c) => c.averageMarks);
  const totalStudents = classStats.reduce((s, c) => s + c.studentCount, 0);

  const sorted = [...classStats].sort((a, b) => b.averageMarks - a.averageMarks);

  return {
    totalStudents,
    overallAverage: Math.round(average(allAverages) * 100) / 100,
    overallPassRate:
      classStats.length > 0
        ? Math.round(average(classStats.map((c) => c.passRate)))
        : 0,
    bestClass: sorted[0]?.className ?? "N/A",
    worstClass: sorted[sorted.length - 1]?.className ?? "N/A",
  };
}

// ── Fee Statistics ────────────────────────────────────────────────

interface FeeStats {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  byClass: { classId: string; className: string; expected: number; collected: number; outstanding: number }[];
}

/** Calculate fee collection statistics. */
export function feeStatistics(
  entries: { classId: string; className: string; expected: number; collected: number }[]
): FeeStats {
  const byClass = entries.map((e) => ({
    classId: e.classId,
    className: e.className,
    expected: e.expected,
    collected: e.collected,
    outstanding: e.expected - e.collected,
  }));

  const totalExpected = sum(byClass.map((c) => c.expected));
  const totalCollected = sum(byClass.map((c) => c.collected));

  return {
    totalExpected,
    totalCollected,
    totalOutstanding: totalExpected - totalCollected,
    collectionRate: Math.round(feeCollectionRate(totalCollected, totalExpected) * 100) / 100,
    byClass,
  };
}

// ── Attendance Statistics ─────────────────────────────────────────

interface AttendanceStats {
  totalDays: number;
  averageAttendanceRate: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
}

/** Calculate attendance statistics for a student over a period. */
export function attendanceStatistics(
  records: { status: "present" | "absent" | "late" | "excused" }[]
): AttendanceStats {
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const excused = records.filter((r) => r.status === "excused").length;

  return {
    totalDays: records.length,
    averageAttendanceRate: Math.round(attendanceRate(present, late, excused, records.length) * 100) / 100,
    presentDays: present,
    absentDays: absent,
    lateDays: late,
    excusedDays: excused,
  };
}

// ── Discipline Statistics ─────────────────────────────────────────

interface DisciplineStats {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  byCategory: Record<string, number>;
  resolutionRate: number;
}

/** Calculate discipline statistics. */
export function disciplineStatistics(
  incidents: { category: string; resolutionStatus: string }[]
): DisciplineStats {
  const byCategory: Record<string, number> = {};
  for (const i of incidents) {
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  }

  const resolved = incidents.filter(
    (i) => i.resolutionStatus === "resolved"
  ).length;

  return {
    totalIncidents: incidents.length,
    openIncidents: incidents.filter((i) => i.resolutionStatus === "open").length,
    resolvedIncidents: resolved,
    byCategory,
    resolutionRate: Math.round(percentage(resolved, incidents.length) * 100) / 100,
  };
}
