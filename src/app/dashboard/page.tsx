"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, BookMarked, AlertCircle, CircleDollarSign, Download, FileText,
  Plus, ArrowRight, GraduationCap, BookCopy, ShieldAlert, Wrench, Bell, Shield,
  Stethoscope, TrendingUp, UserCheck, Briefcase, MessageSquare, Trophy, Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { exportMultiSheetCsv } from "@/lib/csv-export";
import {
  BarChart, LineChart, DoughnutChart, HorizontalBarChart, RadialProgress,
  Sparkline, EmptyChart,
} from "@/components/charts";
import { ChartConfigPanel } from "@/components/chart-config-panel";

function fmtKESCompact(n: number) {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE")}`;
}

export default function Dashboard() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  const stats = useQuery(
    api.dashboardStats.getDashboardStats,
    school ? { schoolId: school._id } : "skip"
  );
  const analytics = useQuery(
    api.schoolAnalytics.getDashboardAnalytics,
    school ? { schoolId: school._id } : "skip"
  );

  const primary = school?.primaryColor ?? "#2563eb";
  const secondary = school?.secondaryColor ?? "#64748b";

  // ── Use aggregate data from stats (no full-list queries needed) ─────
  const subscription = useQuery(api.billing.getMySubscription);

  // Live clock — ticks every 60 s so the countdown updates without page refresh.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Chart configuration for this page
  const chartConfigs = useQuery(
    api.chartConfigs.listByPage,
    school ? { schoolId: school._id, page: "dashboard" } : "skip"
  );

  // Helper: check if a chart is visible (defaults to true for backward compat)
  function isChartVisible(chartKey: string): boolean {
    if (!chartConfigs) return true; // loading — show everything
    const config = chartConfigs.find((c) => c.chartKey === chartKey);
    return config ? config.isVisible : true;
  }

  // Borrowings over time and students per class now come from stats (server-computed)
  const borrowingsOverTime = stats?.borrowingsOverTime ?? [];
  const studentsPerClass = stats?.studentsPerClass ?? [];

  // ── Export (lazy-loaded — only fetch when user clicks) ───────────
  const [exporting, setExporting] = useState(false);
  const [exportRequested, setExportRequested] = useState(false);
  const exportStudents = useQuery(api.students.listBySchool, exportRequested && school ? { schoolId: school._id } : "skip");
  const exportClasses = useQuery(api.classes.listBySchool, exportRequested && school ? { schoolId: school._id } : "skip");
  const exportBooks = useQuery(api.books.listBySchool, exportRequested && school ? { schoolId: school._id } : "skip");

  function handleFullExport() {
    if (!school) return;
    if (!exportRequested) {
      // First click: trigger the queries
      setExportRequested(true);
      return;
    }
    if (!exportStudents || !exportClasses || !exportBooks) return; // still loading
    setExporting(true);
    const sheets = [
      {
        name: "students",
        data: exportStudents.map((s) => ({
          FirstName: s.firstName,
          LastName: s.lastName,
          "Admission No": s.admNo,
          Status: s.status ?? "",
        })),
      },
      {
        name: "classes",
        data: exportClasses.map((c) => ({ Name: c.name, HasStreams: c.hasStreams ? "Yes" : "No" })),
      },
      {
        name: "books",
        data: exportBooks.map((b) => ({
          Title: b.title,
          Author: b.author,
          "Available Copies": b.availableCopies,
          "Total Copies": b.totalCopies,
        })),
      },
    ].filter((s) => s.data.length > 0);

    exportMultiSheetCsv(sheets, school.name.replace(/\s+/g, "_"));
    setExporting(false);
    setExportRequested(false); // reset so next click re-fetches fresh data
  }

  if (stats === undefined || analytics === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const finance = analytics.finance;
  const academic = analytics.academic;
  const attendance = analytics.attendance;

  // ── KPI cards ───────────────────────────────────────────────────────
  const primaryStats = [
    { label: "Students", value: stats.academics.students, icon: Users, color: "text-blue-600", bg: "bg-blue-50", href: "/dashboard/students", spark: null as number[] | null },
    { label: "Teachers", value: stats.academics.teachers, icon: GraduationCap, color: "text-green-600", bg: "bg-green-50", href: "/dashboard/teachers", spark: null },
    { label: "Classes", value: stats.academics.classes, icon: BookOpen, color: "text-purple-600", bg: "bg-purple-50", href: "/dashboard/classes", spark: null },
    { label: "Attendance", value: `${attendance.today.rate}%`, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50", href: "/dashboard/attendance", spark: attendance.trend.length ? attendance.trend.map((t) => t.rate) : null },
    { label: "Fees Collected", value: finance ? `${finance.collectionRate}%` : "—", icon: TrendingUp, color: finance && finance.collectionRate >= 80 ? "text-green-600" : "text-yellow-600", bg: finance && finance.collectionRate >= 80 ? "bg-green-50" : "bg-yellow-50", href: "/dashboard/fees", spark: finance?.trend.length ? finance.trend.map((t) => t.collected) : null },
    { label: "Notifications", value: stats.notifications.unread, icon: Bell, color: "text-orange-600", bg: "bg-orange-50", href: "/dashboard/notifications", spark: null },
  ];

  // ── Attention items ─────────────────────────────────────────────────
  const attentionItems = [
    { label: "Open Incidents", value: stats.discipline.open, icon: ShieldAlert, color: "text-red-600", bg: "bg-red-600", href: "/dashboard/discipline", urgent: stats.discipline.open > 0 },
    { label: "Pending Admissions", value: stats.admissions.pending, icon: Users, color: "text-yellow-600", bg: "bg-yellow-50", href: "/dashboard/admissions", urgent: stats.admissions.pending > 0 },
    { label: "Pending Leaves", value: stats.staff.pendingLeaves, icon: Briefcase, color: "text-yellow-600", bg: "bg-yellow-50", href: "/dashboard/hr", urgent: stats.staff.pendingLeaves > 0 },
    { label: "Expired Docs", value: stats.compliance.expired, icon: Shield, color: "text-red-600", bg: "bg-red-50", href: "/dashboard/compliance", urgent: stats.compliance.expired > 0 },
    { label: "Maintenance", value: stats.maintenance.pending, icon: Wrench, color: "text-orange-600", bg: "bg-orange-50", href: "/dashboard/maintenance", urgent: stats.maintenance.pending > 0 },
  ];
  const urgentItems = attentionItems.filter((i) => i.urgent);

  const quickActions = [
    { label: "Add Student", href: "/dashboard/students", icon: Plus, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Record Payment", href: "/dashboard/fees", icon: CircleDollarSign, color: "text-green-600", bg: "bg-green-50" },
    { label: "Mark Attendance", href: "/dashboard/attendance", icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "View Reports", href: "/dashboard/reports", icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "AI Assistant", href: "/dashboard/ai-assistant", icon: Star, color: "text-yellow-600", bg: "bg-yellow-50" },
    { label: "Announcements", href: "/dashboard/announcements", icon: MessageSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  const hasFinance = !!finance && finance.studentCount > 0;
  const hasAcademic = academic.examTrend.length > 0 || academic.byClass.length > 0;
  const hasAttendance = attendance.trend.some((t) => t.total > 0) || attendance.today.total > 0;

  const methodLabels: Record<string, string> = {
    cash: "Cash",
    mpesa: "M-Pesa",
    bank_transfer: "Bank Transfer",
    other: "Other",
  };

  return (
    <div className="space-y-6">
      {/* ── Subscription cancelled-but-active banner ────────────────── */}
      {subscription?.isCancelledButActive && subscription.nextBillingDate && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-yellow-200 bg-yellow-50/80">
          <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-yellow-800">Subscription cancelled</span>{" "}
            <span className="text-yellow-700">
              — active until {new Date(subscription.nextBillingDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}.{' '}
            </span>
            <Link href="/dashboard/billing" className="underline text-yellow-800 hover:text-yellow-900">
              Resubscribe
            </Link>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here&apos;s your school at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {school && (
            <ChartConfigPanel
              schoolId={school._id}
              page="dashboard"
              configs={chartConfigs ?? []}
            />
          )}
          <Link href="/dashboard/reports">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Reports
            </Button>
          </Link>
          <Button onClick={handleFullExport}>
            <Download className="h-4 w-4 mr-2" /> Full Export
          </Button>
        </div>
      </div>

      {/* ── Urgent Attention Banner ───────────────────────────────── */}
      {urgentItems.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Attention Required</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {urgentItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <Badge variant="danger" className="cursor-pointer hover:opacity-80">
                    {item.label}: {item.value}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription Status Card (cancelled but active) ──────────── */}
      {subscription?.isCancelledButActive && subscription.nextBillingDate && (() => {
        const daysRemaining = Math.max(0, Math.ceil((subscription.nextBillingDate - now) / (24 * 60 * 60 * 1000)));
        const periodStart = subscription.lastPaymentAt ?? subscription.trialStartedAt ?? 0;
        const periodEnd = subscription.nextBillingDate;
        const periodMs = Math.max(1, periodEnd - periodStart);
        const elapsedPct = Math.min(100, Math.max(0, ((now - periodStart) / periodMs) * 100));
        const remainingPct = Math.max(0, 100 - elapsedPct);
        const barColor = daysRemaining > 7 ? "bg-green-500" : daysRemaining > 3 ? "bg-yellow-500" : "bg-red-500";
        const textColor = daysRemaining > 7 ? "text-green-700" : daysRemaining > 3 ? "text-yellow-700" : "text-red-700";
        return (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-yellow-100 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Subscription cancelled</p>
                    <p className="text-xs text-muted-foreground">
                      {subscription.cancelledAt && (
                        <>Cancelled on {new Date(subscription.cancelledAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} ·{' '}</>
                      )}
                      Active until {new Date(subscription.nextBillingDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/billing">
                  <Button variant="outline" size="sm">
                    Resubscribe <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Billing period elapsed</span>
                  <span className={`font-medium ${textColor}`}>{daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
                    style={{ width: `${elapsedPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Primary Stats Grid (with sparklines) ──────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch">
        {primaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="h-full">
              <Card className={`h-full ${stat.bg} border-l-2 border-l-primary/30 hover:shadow-md transition-shadow cursor-pointer`}>
                <CardContent className="p-4 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 shrink-0 ${stat.color}`} />
                    <span className="text-xs font-medium text-muted-foreground truncate">{stat.label}</span>
                  </div>
                  <div className="text-2xl font-bold leading-none">{stat.value}</div>
                  <div className="mt-auto pt-3 flex-1 flex items-end min-h-[30px]">
                    {stat.spark && stat.spark.length > 1 ? (
                      <Sparkline data={stat.spark} width={120} height={26} color={stat.color.includes("red") || stat.color.includes("yellow") ? "#f59e0b" : "#10b981"} />
                    ) : (
                      <div className="h-[26px] w-full" aria-hidden />
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* ══ Financial Performance (leadership only) ═════════════════ */}
      {isLeadership && hasFinance && isChartVisible("fee_collection_trend") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-bold">Financial Performance</h2>
            <span className="text-xs text-muted-foreground">{finance.termName}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Collection rate + totals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Collection Rate</CardTitle>
                <CardDescription>{finance.paymentCount} payments recorded</CardDescription>
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
                    <p className="text-sm font-bold">{fmtKESCompact(finance.expected)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Collected</p>
                    <p className="text-sm font-bold text-green-600">{fmtKESCompact(finance.collected)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Outstanding</p>
                    <p className={`text-sm font-bold ${finance.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmtKESCompact(finance.outstanding)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Collection trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fee Collection Trend</CardTitle>
                <CardDescription>Weekly collections, last 12 weeks</CardDescription>
              </CardHeader>
              <CardContent>
                {finance.trend.some((t) => t.collected > 0) ? (
                  <LineChart
                    labels={finance.trend.map((t) => t.label)}
                    datasets={[{ label: "Collected", data: finance.trend.map((t) => t.collected), color: "#22c55e" }]}
                    height={220}
                    showArea
                  />
                ) : (
                  <EmptyChart message="No payments recorded this term yet" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Per-class fee collection */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fee Collection by Class</CardTitle>
                <CardDescription>Expected vs collected, current term</CardDescription>
              </CardHeader>
              <CardContent>
                {finance.byClass.length > 0 ? (
                  <HorizontalBarChart
                    labels={finance.byClass.map((c) => c.className)}
                    datasets={[
                      { label: "Expected", data: finance.byClass.map((c) => c.expected), color: "#94a3b8" },
                      { label: "Collected", data: finance.byClass.map((c) => c.collected), color: primary },
                    ]}
                    height={260}
                  />
                ) : (
                  <EmptyChart message="No fee structures for this term yet" />
                )}
              </CardContent>
            </Card>

            {/* Payment methods */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Methods</CardTitle>
                <CardDescription>How fees are being paid</CardDescription>
              </CardHeader>
              <CardContent>
                {finance.byMethod.length > 0 ? (
                  <DoughnutChart
                    labels={finance.byMethod.map((m) => methodLabels[m.method] ?? m.method)}
                    data={finance.byMethod.map((m) => m.amount)}
                    height={220}
                  />
                ) : (
                  <EmptyChart message="No payments yet" />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══ Academic Performance ════════════════════════════════════ */}
      {hasAcademic && isChartVisible("exam_mean_trend") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold">Academic Performance</h2>
            {academic.latestExamName && (
              <span className="text-xs text-muted-foreground">Latest: {academic.latestExamName}</span>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Exam mean trend */}
            {academic.examTrend.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Exam Mean Trend</CardTitle>
                  <CardDescription>Average marks across exams</CardDescription>
                </CardHeader>
                <CardContent>
                  <LineChart
                    labels={academic.examTrend.map((e) => e.label)}
                    datasets={[{ label: "Mean marks", data: academic.examTrend.map((e) => e.meanMarks), color: "#8b5cf6" }]}
                    height={230}
                    showArea
                  />
                </CardContent>
              </Card>
            )}

            {/* Top students */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-yellow-500" /> Top Students
                </CardTitle>
                <CardDescription>{academic.latestExamName ?? "Latest exam"}</CardDescription>
              </CardHeader>
              <CardContent>
                {academic.topStudents.length > 0 ? (
                  <div className="space-y-2">
                    {academic.topStudents.map((s, i) => (
                      <Link key={s.studentId} href={`/dashboard/students`}>
                        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-200 text-gray-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.className} · {s.admNo}</p>
                          </div>
                          <span className="text-sm font-bold text-purple-600">{s.meanMarks}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyChart message="No exam results yet" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Per-class performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Performance by Class</CardTitle>
                <CardDescription>Mean marks on the latest exam</CardDescription>
              </CardHeader>
              <CardContent>
                {academic.byClass.length > 0 ? (
                  <BarChart
                    labels={academic.byClass.map((c) => c.className)}
                    datasets={[{ label: "Mean marks", data: academic.byClass.map((c) => c.meanMarks), color: primary }]}
                    height={230}
                  />
                ) : (
                  <EmptyChart message="No class results yet" />
                )}
              </CardContent>
            </Card>

            {/* Subject means */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Subject Averages</CardTitle>
                <CardDescription>Mean marks per subject, latest exam</CardDescription>
              </CardHeader>
              <CardContent>
                {academic.bySubject.length > 0 ? (
                  <HorizontalBarChart
                    labels={academic.bySubject.map((s) => s.subjectName)}
                    datasets={[{ label: "Mean marks", data: academic.bySubject.map((s) => s.meanMarks), color: "#8b5cf6" }]}
                    height={230}
                  />
                ) : (
                  <EmptyChart message="No subject results yet" />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══ Attendance & Engagement ═════════════════════════════════ */}
      {hasAttendance && isChartVisible("attendance_rate_trend") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold">Attendance &amp; Engagement</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 14-day trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Daily Attendance Rate</CardTitle>
                <CardDescription>Last 14 days</CardDescription>
              </CardHeader>
              <CardContent>
                {attendance.trend.some((t) => t.total > 0) ? (
                  <LineChart
                    labels={attendance.trend.map((t) => t.label)}
                    datasets={[{ label: "Attendance %", data: attendance.trend.map((t) => t.rate), color: "#10b981" }]}
                    height={230}
                    showArea
                  />
                ) : (
                  <EmptyChart message="No attendance recorded yet" />
                )}
              </CardContent>
            </Card>

            {/* Today's breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today&apos;s Status</CardTitle>
                <CardDescription>{attendance.today.total} records</CardDescription>
              </CardHeader>
              <CardContent>
                {attendance.today.total > 0 ? (
                  <DoughnutChart
                    labels={["Present", "Absent", "Late", "Excused"]}
                    data={[attendance.today.present, attendance.today.absent, attendance.today.late, attendance.today.excused]}
                    height={220}
                  />
                ) : (
                  <EmptyChart message="No attendance taken today" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-class attendance */}
          {attendance.byClass.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Attendance by Class</CardTitle>
                <CardDescription>Last 30 days — lowest first</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  labels={attendance.byClass.map((c) => c.className)}
                  datasets={[{ label: "Attendance %", data: attendance.byClass.map((c) => c.rate), color: "#10b981" }]}
                  height={Math.max(140, attendance.byClass.length * 34)}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Module Overview Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "Clinic Visits (7d)", value: stats.health.recentVisits, icon: Stethoscope, color: "text-pink-600", href: "/dashboard/health" },
          { label: "Expenditure", value: stats.expenditures > 0 ? `$${stats.expenditures.toLocaleString()}` : "$0", icon: CircleDollarSign, color: "text-green-600", bg: "bg-green-50", href: "/dashboard/fees" },
          { label: "Discipline Incidents", value: stats.discipline.total, icon: ShieldAlert, color: "text-red-600", href: "/dashboard/discipline" },
          { label: "Guardians", value: stats.guardians, icon: Users, color: "text-teal-600", href: "/dashboard/guardians" },
          { label: "Announcements", value: stats.announcements, icon: MessageSquare, color: "text-indigo-600", href: "/dashboard/announcements" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="text-xl font-bold">{item.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* ── Bottom Row: Attention + Quick Actions ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-orange-600" /> Needs Attention
            </CardTitle>
            <CardDescription>Items requiring your action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {attentionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} href={item.href}>
                    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center`}>
                          <Icon className={`h-4 w-4 ${item.color}`} />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${item.urgent ? "text-red-600" : "text-muted-foreground"}`}>
                          {item.value}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.label} href={action.href}>
                    <div
                      className={`${action.bg} rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-primary/20`}
                    >
                      <Icon className={`h-5 w-5 ${action.color}`} />
                      <span className="text-sm font-medium">{action.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
