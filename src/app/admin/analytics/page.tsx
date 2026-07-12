"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  School, Users, BookOpen, BookMarked, AlertTriangle,
  CircleDollarSign, TrendingUp, Activity, Download, Loader2,
} from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";

export default function AdminAnalyticsPage() {
  const overview = useQuery(api.analytics.systemOverview);
  const schoolComparison = useQuery(api.analytics.schoolComparison);

  if (overview === undefined || schoolComparison === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    { label: "Schools", value: overview?.totalSchools ?? 0, icon: School, color: "text-blue-600" },
    { label: "Total Students", value: overview?.totalStudents ?? 0, icon: Users, color: "text-green-600" },
    { label: "Total Books", value: overview?.totalBooks ?? 0, icon: BookOpen, color: "text-purple-600" },
    { label: "Active Borrowings", value: overview?.activeBorrowings ?? 0, icon: BookMarked, color: "text-orange-600" },
    { label: "Overdue Rate", value: `${overview?.overdueRate ?? 0}%`, icon: AlertTriangle, color: "text-red-600" },
    { label: "Unpaid Fines", value: `$${(overview?.unpaidFines ?? 0).toFixed(2)}`, icon: CircleDollarSign, color: "text-yellow-600" },
  ];

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
    if (score >= 80) return <Badge className="bg-green-100 text-green-800">{score}</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-800">{score}</Badge>;
    return <Badge className="bg-red-100 text-red-800">{score}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Analytics</h1>
          <p className="text-muted-foreground mt-1">Overview of all schools and system health</p>
        </div>
        {schoolComparison && schoolComparison.length > 0 && (
          <Button variant="outline" onClick={handleExportComparison}>
            <Download className="h-4 w-4 mr-2" /> Export Comparison
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <div className="text-2xl font-bold mt-1">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> School Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">School</th>
                  <th className="text-right p-2">Students</th>
                  <th className="text-right p-2">Books</th>
                  <th className="text-right p-2">Active</th>
                  <th className="text-right p-2">Overdue</th>
                  <th className="text-right p-2">Engagement</th>
                  <th className="text-right p-2">Features</th>
                  <th className="text-right p-2">Health</th>
                </tr>
              </thead>
              <tbody>
                {schoolComparison?.map((s) => (
                  <tr key={s.schoolId} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{s.schoolName}</td>
                    <td className="p-2 text-right">{s.studentCount}</td>
                    <td className="p-2 text-right">{s.bookCount}</td>
                    <td className="p-2 text-right">{s.activeBorrowings}</td>
                    <td className="p-2 text-right">
                      <span className={s.overdueRate > 20 ? "text-red-600 font-medium" : ""}>
                        {s.overdueRate}%
                      </span>
                    </td>
                    <td className="p-2 text-right">{s.engagementRate}%</td>
                    <td className="p-2 text-right">{s.featureAdoption}%</td>
                    <td className="p-2 text-right">{getHealthBadge(s.healthScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!schoolComparison || schoolComparison.length === 0) && (
            <p className="text-muted-foreground text-center py-8">No school data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
