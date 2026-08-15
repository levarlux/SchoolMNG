"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, GraduationCap, CircleDollarSign, UserCheck, Trophy, Calendar,
  TrendingUp, Users, Download, FileText,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import {
  BarChart, LineChart, DoughnutChart, HorizontalBarChart, RadialProgress,
  EmptyChart, ChartCard,
} from "@/components/charts";

function fmtKES(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

type Tab = "attendance" | "academic" | "financial";
const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "attendance", label: "Attendance", icon: UserCheck },
  { key: "academic", label: "Academic", icon: GraduationCap },
  { key: "financial", label: "Financial", icon: CircleDollarSign },
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

export default function AnalyticsPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  // ── Filters ─────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("attendance");
  const [termId, setTermId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });

  const terms = useQuery(api.terms.listBySchool, school ? { schoolId: school._id } : "skip");
  const analytics = useQuery(
    api.schoolAnalytics.getDashboardAnalytics,
    school ? { schoolId: school._id, termId: termId as any || undefined } : "skip"
  );
  const attendanceAnalytics = useQuery(
    api.schoolAnalytics.getAttendanceAnalytics,
    school && tab === "attendance"
      ? { schoolId: school._id, dateFrom: new Date(dateFrom).getTime() }
      : "skip"
  );

  const finance = analytics?.finance;
  const academic = analytics?.academic;

  const selectedTermLabel = useMemo(() => {
    if (!termId || !terms) return "All terms";
    const t = terms.find((t) => t._id === termId);
    return t ? `${t.name} ${t.year}` : "All terms";
  }, [termId, terms]);

  if (!school || analytics === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  // ── Export helpers ──────────────────────────────────────────────
  function exportAttendanceCSV() {
    if (!attendanceAnalytics) return;
    exportToCsv(
      attendanceAnalytics.byClass.map((c) => ({
        Class: c.className,
        "Attendance %": c.rate,
        "Total Records": c.total,
      })),
      "attendance-analytics"
    );
    toast.success("Attendance export downloaded");
  }

  function exportAcademicCSV() {
    if (!academic) return;
    const rows: Record<string, string | number>[] = [];
    for (const c of academic.byClass) {
      rows.push({ Type: "Class", Name: c.className, "Mean Marks": c.meanMarks, Students: c.students });
    }
    for (const s of academic.bySubject) {
      rows.push({ Type: "Subject", Name: s.subjectName, "Mean Marks": s.meanMarks, Students: "-" });
    }
    for (const s of academic.topStudents) {
      rows.push({ Type: "Top Student", Name: s.name, "Mean Marks": s.meanMarks, Students: s.className });
    }
    exportToCsv(rows, "academic-analytics");
    toast.success("Academic export downloaded");
  }

  function exportFinanceCSV() {
    if (!finance) return;
    exportToCsv(
      finance.byClass.map((c) => ({
        Class: c.className,
        Expected: c.expected,
        Collected: c.collected,
        "Collection %": c.rate,
      })),
      "fee-analytics"
    );
    toast.success("Finance export downloaded");
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Visual breakdown of attendance, academic performance, and finances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/reports">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Term</Label>
          <Select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="w-48"
          >
            <option value="">All terms</option>
            {(terms ?? []).map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} {t.year}
              </option>
            ))}
          </Select>
        </div>
        {tab === "attendance" && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date from</Label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        )}
        <div className="flex gap-1 ml-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const show = t.key !== "financial" || isLeadership;
            if (!show) return null;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ Attendance tab ═══════════════════════════════════════════ */}
      {tab === "attendance" && attendanceAnalytics && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* KPI: today */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today&apos;s Attendance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <RadialProgress
                  value={attendanceAnalytics.today.rate}
                  size={130}
                  stroke={13}
                  color={
                    attendanceAnalytics.today.rate >= 90
                      ? "#22c55e"
                      : attendanceAnalytics.today.rate >= 70
                      ? "#f59e0b"
                      : "#ef4444"
                  }
                  label={`${attendanceAnalytics.today.total} records`}
                />
                <div className="grid grid-cols-4 gap-3 w-full mt-4 text-center text-xs">
                  <div>
                    <p className="text-green-600 font-bold">{attendanceAnalytics.today.present}</p>
                    <p className="text-muted-foreground">Present</p>
                  </div>
                  <div>
                    <p className="text-red-600 font-bold">{attendanceAnalytics.today.absent}</p>
                    <p className="text-muted-foreground">Absent</p>
                  </div>
                  <div>
                    <p className="text-yellow-600 font-bold">{attendanceAnalytics.today.late}</p>
                    <p className="text-muted-foreground">Late</p>
                  </div>
                  <div>
                    <p className="text-blue-600 font-bold">{attendanceAnalytics.today.excused}</p>
                    <p className="text-muted-foreground">Excused</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Attendance Rate Trend</CardTitle>
                    <CardDescription>Daily since {dateFrom}</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={exportAttendanceCSV}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {attendanceAnalytics.trend.some((t) => t.total > 0) ? (
                  <LineChart
                    labels={attendanceAnalytics.trend.map((t) => t.label)}
                    datasets={[{ label: "Attendance %", data: attendanceAnalytics.trend.map((t) => t.rate), color: "#10b981" }]}
                    height={260}
                    showArea
                  />
                ) : (
                  <EmptyChart message="No attendance data in this range" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-class */}
          {attendanceAnalytics.byClass.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Attendance by Class</CardTitle>
                <CardDescription>{selectedTermLabel} — lowest first</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  labels={attendanceAnalytics.byClass.map((c) => c.className)}
                  datasets={[{ label: "Attendance %", data: attendanceAnalytics.byClass.map((c) => c.rate), color: "#10b981" }]}
                  height={Math.max(160, attendanceAnalytics.byClass.length * 34)}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ Academic tab ════════════════════════════════════════════ */}
      {tab === "academic" && academic && (
        <div className="space-y-4">
          {/* Exam trend */}
          {academic.examTrend.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Exam Mean Trend</CardTitle>
                    <CardDescription>Average marks across exams</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={exportAcademicCSV}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <LineChart
                  labels={academic.examTrend.map((e) => e.label)}
                  datasets={[{ label: "Mean marks", data: academic.examTrend.map((e) => e.meanMarks), color: "#8b5cf6" }]}
                  height={280}
                  showArea
                />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Per-class */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance by Class</CardTitle>
                <CardDescription>Mean marks on the latest exam</CardDescription>
              </CardHeader>
              <CardContent>
                {academic.byClass.length > 0 ? (
                  <BarChart
                    labels={academic.byClass.map((c) => c.className)}
                    datasets={[{ label: "Mean marks", data: academic.byClass.map((c) => c.meanMarks), color: "#6366f1" }]}
                    height={260}
                  />
                ) : (
                  <EmptyChart message="No class results yet" />
                )}
              </CardContent>
            </Card>

            {/* Subjects */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Subject Averages</CardTitle>
                <CardDescription>Mean marks per subject</CardDescription>
              </CardHeader>
              <CardContent>
                {academic.bySubject.length > 0 ? (
                  <HorizontalBarChart
                    labels={academic.bySubject.map((s) => s.subjectName)}
                    datasets={[{ label: "Mean marks", data: academic.bySubject.map((s) => s.meanMarks), color: "#8b5cf6" }]}
                    height={260}
                  />
                ) : (
                  <EmptyChart message="No subject results yet" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top students */}
          {academic.topStudents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-yellow-500" /> Top Students
                </CardTitle>
                <CardDescription>{academic.latestExamName ?? "Latest exam"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {academic.topStudents.map((s, i) => (
                    <div key={s.studentId} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-200 text-gray-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.className} · {s.admNo}</p>
                      </div>
                      <span className="text-sm font-bold text-purple-600">{s.meanMarks}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ Financial tab (leadership only) ═════════════════════════ */}
      {tab === "financial" && isLeadership && finance && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Collection rate */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Collection Rate</CardTitle>
                <CardDescription>{finance.termName} · {finance.paymentCount} payments</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <RadialProgress
                  value={finance.collectionRate}
                  size={130}
                  stroke={13}
                  color={finance.collectionRate >= 80 ? "#22c55e" : finance.collectionRate >= 50 ? "#f59e0b" : "#ef4444"}
                  label="of expected fees"
                />
                <div className="grid grid-cols-3 gap-3 w-full mt-4 text-center">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Expected</p>
                    <p className="text-sm font-bold">{fmtKES(finance.expected)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Collected</p>
                    <p className="text-sm font-bold text-green-600">{fmtKES(finance.collected)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Outstanding</p>
                    <p className={`text-sm font-bold ${finance.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmtKES(finance.outstanding)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Collection trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Fee Collection Trend</CardTitle>
                    <CardDescription>Weekly collections, last 12 weeks</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={exportFinanceCSV}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {finance.trend.some((t) => t.collected > 0) ? (
                  <LineChart
                    labels={finance.trend.map((t) => t.label)}
                    datasets={[{ label: "Collected", data: finance.trend.map((t) => t.collected), color: "#22c55e" }]}
                    height={260}
                    showArea
                  />
                ) : (
                  <EmptyChart message="No payments recorded this term" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Per-class */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fee Collection by Class</CardTitle>
                <CardDescription>Expected vs collected</CardDescription>
              </CardHeader>
              <CardContent>
                {finance.byClass.length > 0 ? (
                  <HorizontalBarChart
                    labels={finance.byClass.map((c) => c.className)}
                    datasets={[
                      { label: "Expected", data: finance.byClass.map((c) => c.expected), color: "#94a3b8" },
                      { label: "Collected", data: finance.byClass.map((c) => c.collected), color: "#2563eb" },
                    ]}
                    height={280}
                  />
                ) : (
                  <EmptyChart message="No fee structures for this term" />
                )}
              </CardContent>
            </Card>

            {/* Payment methods */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                {finance.byMethod.length > 0 ? (
                  <DoughnutChart
                    labels={finance.byMethod.map((m) => METHOD_LABELS[m.method] ?? m.method)}
                    data={finance.byMethod.map((m) => m.amount)}
                    height={240}
                  />
                ) : (
                  <EmptyChart message="No payments yet" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top debtors */}
          {finance.topDebtors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top Debtors</CardTitle>
                <CardDescription>Students with the highest outstanding balances</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Student</th>
                        <th className="text-left p-2.5 font-medium">Class</th>
                        <th className="text-right p-2.5 font-medium">Expected</th>
                        <th className="text-right p-2.5 font-medium">Paid</th>
                        <th className="text-right p-2.5 font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.topDebtors.map((d) => (
                        <tr key={d.studentId} className="border-t border-border">
                          <td className="p-2.5 font-medium">{d.name}</td>
                          <td className="p-2.5 text-muted-foreground">{d.className}</td>
                          <td className="p-2.5 text-right">{fmtKES(d.expected)}</td>
                          <td className="p-2.5 text-right">{fmtKES(d.paid)}</td>
                          <td className="p-2.5 text-right font-semibold text-red-600">{fmtKES(d.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Financial tab — non-leadership */}
      {tab === "financial" && !isLeadership && (
        <Card>
          <CardContent className="p-8 text-center">
            <CircleDollarSign className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Financial analytics are available to the school head only.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
