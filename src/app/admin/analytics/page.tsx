"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { School, Users, BookOpen, BookMarked, AlertTriangle, CircleDollarSign, TrendingUp, Activity, Download, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";
import { DoughnutChart, BarChart } from "@/components/charts";

export default function AdminAnalyticsPage() {
  const overview = useQuery(api.analytics.systemOverview);
  const schoolComparison = useQuery(api.analytics.schoolComparison);

  if (overview === undefined || schoolComparison === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const stats = [
    {
      label: "Total Schools",
      value: overview?.totalSchools ?? 0,
      icon: School,
      color: "text-blue-600",
      bg: "bg-blue-50",
      change: "+2",
      changeType: "positive" as const,
    },
    {
      label: "Total Students",
      value: overview?.totalStudents ?? 0,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
      change: "+124",
      changeType: "positive" as const,
    },
    {
      label: "Total Books",
      value: overview?.totalBooks ?? 0,
      icon: BookOpen,
      color: "text-purple-600",
      bg: "bg-purple-50",
      change: "+56",
      changeType: "positive" as const,
    },
    {
      label: "Active Borrowings",
      value: overview?.activeBorrowings ?? 0,
      icon: BookMarked,
      color: "text-orange-600",
      bg: "bg-orange-50",
      change: "0",
      changeType: "neutral" as const,
    },
    {
      label: "Overdue Rate",
      value: `${overview?.overdueRate ?? 0}%`,
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-50",
      change: "-2%",
      changeType: "positive" as const,
    },
    {
      label: "Unpaid Fines",
      value: `KES ${(overview?.unpaidFines ?? 0).toLocaleString("en-KE")}`,
      icon: CircleDollarSign,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
      change: "-KES 5,000",
      changeType: "positive" as const,
    },
  ];

  // Prepare chart data
  const topSchools = schoolComparison?.slice(0, 5) ?? [];
  const healthScores = schoolComparison?.map((s) => s.healthScore) ?? [];
  const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0;

  const schoolLabels = topSchools.map((s) => s.schoolName.length > 10 ? s.schoolName.slice(0, 10) + "..." : s.schoolName);

  function handleExportComparison() {
    if (!schoolComparison || schoolComparison.length === 0) return;
    exportToCsv(
      schoolComparison.map((s) => ({
        School: s.schoolName,
        Students: s.studentCount,
        Books: s.bookCount,
        "Active Borrowings": s.activeBorrowings,
        "Overdue Rate": `${s.overdueRate}%`,
        "Engagement Rate": `${s.engagementRate}%`,
        "Feature Adoption": `${s.featureAdoption}%`,
        "Health Score": s.healthScore,
      })),
      "school_comparison"
    );
  }

  function getHealthBadge(score: number) {
    if (score >= 80) return <Badge className="bg-green-100 text-green-700">{score}</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-700">{score}</Badge>;
    return <Badge className="bg-red-100 text-red-700">{score}</Badge>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            System-wide insights and school performance metrics
          </p>
        </div>
        {schoolComparison && schoolComparison.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportComparison}>
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-lg ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                  <div className="flex items-center gap-1">
                    {stat.changeType === "positive" ? (
                      <ArrowUpRight className="h-3 w-3 text-green-500" />
                    ) : (
                      <Minus className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {stat.change}
                    </span>
                  </div>
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student Distribution Bar Chart */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Student Distribution</h3>
                <p className="text-xs text-muted-foreground">Top 5 schools by student count</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            {topSchools.length > 0 ? (
              <BarChart
                labels={schoolLabels}
                datasets={[{
                  label: "Students",
                  data: topSchools.map((s) => s.studentCount),
                  color: "rgba(99, 102, 241, 0.8)",
                }]}
                height={220}
              />
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Distribution Doughnut */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Health Scores</h3>
                <p className="text-xs text-muted-foreground">Avg: {avgHealth}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <PieChart className="h-4 w-4 text-green-600" />
              </div>
            </div>
            {healthScores.length > 0 ? (
              <DoughnutChart
                labels={["Healthy (80+)", "Moderate (50-79)", "At Risk (<50)"]}
                data={[
                  healthScores.filter((s) => s >= 80).length,
                  healthScores.filter((s) => s >= 50 && s < 80).length,
                  healthScores.filter((s) => s < 50).length,
                ]}
                height={220}
              />
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Borrowing Activity Chart */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Borrowing Activity</h3>
              <p className="text-xs text-muted-foreground">Active vs overdue borrowings by school</p>
            </div>
            <div className="p-2 rounded-lg bg-orange-50">
              <Activity className="h-4 w-4 text-orange-600" />
            </div>
          </div>
          {topSchools.length > 0 ? (
            <BarChart
              labels={schoolLabels}
              datasets={[
                {
                  label: "Active",
                  data: topSchools.map((s) => s.activeBorrowings),
                  color: "rgba(34, 197, 94, 0.8)",
                },
                {
                  label: "Overdue",
                  data: topSchools.map((s) => Math.round(s.bookCount * (s.overdueRate / 100))),
                  color: "rgba(239, 68, 68, 0.8)",
                },
              ]}
              height={200}
            />
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* School Comparison Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">School Comparison</h3>
                <p className="text-xs text-muted-foreground">{schoolComparison?.length ?? 0} schools</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">School</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground hidden sm:table-cell">Students</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">Books</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Active</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">Overdue</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">Engagement</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Health</th>
                </tr>
              </thead>
              <tbody>
                {(schoolComparison ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <School className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No school data available</p>
                    </td>
                  </tr>
                ) : (
                  (schoolComparison ?? []).map((s) => (
                    <tr key={s.schoolId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {s.schoolName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{s.schoolName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right hidden sm:table-cell">
                        <span className="text-sm font-medium">{s.studentCount}</span>
                      </td>
                      <td className="p-4 text-right hidden md:table-cell">
                        <span className="text-sm">{s.bookCount}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm text-green-600 font-medium">{s.activeBorrowings}</span>
                      </td>
                      <td className="p-4 text-right hidden lg:table-cell">
                        <span className={`text-sm font-medium ${s.overdueRate > 20 ? "text-red-600" : ""}`}>
                          {s.overdueRate}%
                        </span>
                      </td>
                      <td className="p-4 text-right hidden lg:table-cell">
                        <span className="text-sm">{s.engagementRate}%</span>
                      </td>
                      <td className="p-4 text-right">
                        {getHealthBadge(s.healthScore)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
