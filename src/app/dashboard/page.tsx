"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, BookMarked, AlertCircle, CircleDollarSign, Download, FileText,
  Plus, ArrowRight, Clock, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { exportToCsv } from "@/lib/csv-export";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export default function Dashboard() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const students = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
  const books = useQuery(api.books.listBySchool, school ? { schoolId: school._id } : "skip");
  const activeBorrowings = useQuery(api.borrowings.listActive, school ? { schoolId: school._id } : "skip");
  const allBorrowings = useQuery(api.borrowings.listBySchool, school ? { schoolId: school._id } : "skip");
  const fines = useQuery(api.fines.listBySchool, school ? { schoolId: school._id } : "skip");

  const primary = school?.primaryColor ?? "#2563eb";
  const secondary = school?.secondaryColor ?? "#64748b";

  if (classes === undefined || students === undefined || books === undefined || activeBorrowings === undefined || fines === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overdue = activeBorrowings?.filter((b: any) => b.dueDate < Date.now()) ?? [];
  const totalUnpaid = fines
    ?.filter((f) => f.status === "unpaid")
    .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

  // ── Stats ────────────────────────────────────────────────────────
  const stats = [
    { label: "Classes", value: classes?.length ?? 0, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Students", value: students?.length ?? 0, icon: Users, color: "text-green-600", bg: "bg-green-50" },
    { label: "Books", value: books?.length ?? 0, icon: BookOpen, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Active Borrowings", value: activeBorrowings?.length ?? 0, icon: BookMarked, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Overdue", value: overdue.length, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: "Unpaid Fines", value: `$${(totalUnpaid ?? 0).toFixed(2)}`, icon: CircleDollarSign, color: "text-yellow-600", bg: "bg-yellow-50" },
  ];

  // ── Borrowings Over Time (last 7 days) ───────────────────────────
  const borrowingsOverTime = useMemo(() => {
    if (!allBorrowings) return [];
    const now = new Date();
    const days: { date: string; borrowings: number; returns: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;

      const borrowedCount = allBorrowings.filter(
        (b: any) => b.borrowedAt >= dayStart && b.borrowedAt < dayEnd
      ).length;
      const returnedCount = allBorrowings.filter(
        (b: any) => b.returnedAt && b.returnedAt >= dayStart && b.returnedAt < dayEnd
      ).length;

      days.push({ date: key, borrowings: borrowedCount, returns: returnedCount });
    }
    return days;
  }, [allBorrowings]);

  // ── Fines Status Donut ────────────────────────────────────────────
  const finesByStatus = useMemo(() => {
    if (!fines) return [];
    const unpaid = fines.filter((f) => f.status === "unpaid").reduce((s, f) => s + (f.amount - f.paidAmount), 0);
    const paid = fines.filter((f) => f.status === "paid").reduce((s, f) => s + f.amount, 0);
    const waived = fines.filter((f) => f.status === "waived").reduce((s, f) => s + f.amount, 0);
    return [
      { name: "Unpaid", value: unpaid, color: primary },
      { name: "Paid", value: paid, color: secondary },
      { name: "Waived", value: waived, color: "#f59e0b" },
    ].filter((d) => d.value > 0);
  }, [fines, primary, secondary]);

  // ── Fines by Reason ───────────────────────────────────────────────
  const finesByReason = useMemo(() => {
    if (!fines) return [];
    const map = new Map<string, number>();
    for (const f of fines) {
      map.set(f.reason, (map.get(f.reason) ?? 0) + f.amount);
    }
    return Array.from(map.entries()).map(([reason, amount]) => ({
      reason: reason.charAt(0).toUpperCase() + reason.slice(1),
      amount: Number(amount.toFixed(2)),
    }));
  }, [fines]);

  // ── Recent Activity ──────────────────────────────────────────────
  const recentActivity = useMemo(() => {
    if (!allBorrowings) return [];
    return [...allBorrowings]
      .sort((a: any, b: any) => b.borrowedAt - a.borrowedAt)
      .slice(0, 8);
  }, [allBorrowings]);

  // ── Overdue for table ────────────────────────────────────────────
  const overdueForTable = useMemo(() => {
    return overdue.map((b: any) => {
      const daysOverdue = Math.floor((Date.now() - b.dueDate) / 86400000);
      return { ...b, daysOverdue };
    }).sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);
  }, [overdue]);

  // ── Unpaid Fines ─────────────────────────────────────────────────
  const unpaidFines = useMemo(() => {
    if (!fines) return [];
    return fines
      .filter((f) => f.status === "unpaid")
      .sort((a, b) => (b.amount - b.paidAmount) - (a.amount - a.paidAmount));
  }, [fines]);

  // ── Export ────────────────────────────────────────────────────────
  function handleFullExport() {
    if (!school) return;
    const sheets = [
      {
        name: "classes",
        data: (classes ?? []).map((c) => ({ Name: c.name, HasStreams: c.hasStreams ? "Yes" : "No" })),
      },
      {
        name: "students",
        data: (students ?? []).map((s) => ({
          FirstName: s.firstName,
          LastName: s.lastName,
          "Admission No": s.admNo,
        })),
      },
      {
        name: "books",
        data: (books ?? []).map((b) => ({
          Title: b.title,
          Author: b.author,
          "Available Copies": b.availableCopies,
          "Total Copies": b.totalCopies,
        })),
      },
      {
        name: "borrowings",
        data: (allBorrowings ?? []).map((b: any) => ({
          Book: b.bookName,
          "Book Number": b.bookNumber,
          "Borrowed Date": new Date(b.borrowedAt).toLocaleDateString(),
          "Due Date": new Date(b.dueDate).toLocaleDateString(),
          "Returned Date": b.returnedAt ? new Date(b.returnedAt).toLocaleDateString() : "",
          Status: b.status,
        })),
      },
    ].filter((s) => s.data.length > 0);

    for (const sheet of sheets) {
      exportToCsv(sheet.data, `${school.name.replace(/\s+/g, "_")}_${sheet.name}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here&apos;s your library at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* ── Stats Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={`${stat.bg} border-l-2 border-l-primary/30`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Charts Row 1: Borrowings + Fines Status ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Borrowings Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Borrowings Over Time</CardTitle>
            <CardDescription>Last 7 days of activity</CardDescription>
          </CardHeader>
          <CardContent>
            {borrowingsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={borrowingsOverTime} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      fontSize: "13px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar
                    dataKey="borrowings"
                    name="Borrowed"
                    fill={primary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="returns"
                    name="Returned"
                    fill={secondary}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                No borrowing data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fines Status Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fines Overview</CardTitle>
            <CardDescription>Breakdown by status</CardDescription>
          </CardHeader>
          <CardContent>
            {finesByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={finesByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {finesByStatus.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, undefined]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      fontSize: "13px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {/* Center label */}
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-lg font-bold"
                  >
                    ${(finesByStatus.reduce((s, d) => s + d.value, 0)).toFixed(2)}
                  </text>
                  <text
                    x="50%"
                    y="57%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-xs"
                  >
                    Total
                  </text>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                No fines recorded
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2: Fines by Reason + Recent Activity ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fines by Reason */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fines by Reason</CardTitle>
            <CardDescription>Amounts grouped by cause</CardDescription>
          </CardHeader>
          <CardContent>
            {finesByReason.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={finesByReason}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="reason"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, "Amount"]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      fontSize: "13px",
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill={primary}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No fines recorded
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Activity
            </CardTitle>
            <CardDescription>Latest 8 borrowings</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {recentActivity.map((b: any) => (
                  <div
                    key={b._id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{b.bookName}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.borrowedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant={b.status === "borrowed" ? "warning" : "success"}>
                      {b.status === "borrowed" ? "Active" : "Returned"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No activity yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Overdue Books Table ─────────────────────────────────── */}
      {overdueForTable.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" /> Overdue Books ({overdueForTable.length})
            </CardTitle>
            <CardDescription>Books past their due date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Book</th>
                    <th className="pb-2 font-medium">Borrowed</th>
                    <th className="pb-2 font-medium">Due Date</th>
                    <th className="pb-2 font-medium text-right">Days Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueForTable.slice(0, 10).map((b: any) => (
                    <tr key={b._id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{b.bookName}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(b.borrowedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(b.dueDate).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            b.daysOverdue >= 7
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {b.daysOverdue}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {overdueForTable.length > 10 && (
              <Link
                href="/dashboard/returns"
                className="text-sm text-primary hover:underline mt-3 inline-flex items-center gap-1"
              >
                View all {overdueForTable.length} overdue books <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Bottom Row: Unpaid Fines + Quick Actions ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Unpaid Fines */}
        <Card className="border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-yellow-600" /> Unpaid Fines
            </CardTitle>
            <CardDescription>
              Outstanding balance:{" "}
              <span className="font-semibold text-foreground">
                ${(totalUnpaid ?? 0).toFixed(2)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unpaidFines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Reason</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidFines.slice(0, 6).map((f) => (
                      <tr key={f._id} className="border-b last:border-0">
                        <td className="py-2.5 font-semibold">
                          ${(f.amount - f.paidAmount).toFixed(2)}
                        </td>
                        <td className="py-2.5 capitalize">{f.reason}</td>
                        <td className="py-2.5 text-muted-foreground">
                          {new Date(f.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[160px] text-muted-foreground text-sm">
                No unpaid fines
              </div>
            )}
            {unpaidFines.length > 0 && (
              <Link
                href="/dashboard/fines"
                className="text-sm text-primary hover:underline mt-3 inline-flex items-center gap-1"
              >
                View all fines <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Add Book", href: "/dashboard/books", icon: BookOpen, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Borrow Book", href: "/dashboard/borrow", icon: BookMarked, color: "text-orange-600", bg: "bg-orange-50" },
                { label: "View Reports", href: "/dashboard/reports", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Fines", href: "/dashboard/fines", icon: CircleDollarSign, color: "text-yellow-600", bg: "bg-yellow-50" },
              ].map((action) => (
                <Link key={action.label} href={action.href}>
                  <div
                    className={`${action.bg} rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-primary/20`}
                  >
                    <action.icon className={`h-5 w-5 ${action.color}`} />
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
