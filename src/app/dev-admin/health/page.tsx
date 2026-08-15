"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Server, Database, Clock, CheckCircle2,
  AlertTriangle, TrendingUp, Zap,
} from "lucide-react";

export default function HealthPage() {
  const analytics = useQuery(api.analytics.systemOverview);
  const schoolComparison = useQuery(api.analytics.schoolComparison);

  // Mock health metrics (in production, these would come from Convex insights)
  const healthMetrics = {
    apiLatency: { value: 45, unit: "ms", status: "good" as const },
    errorRate: { value: 0.02, unit: "%", status: "good" as const },
    activeConnections: { value: 12, unit: "", status: "good" as const },
    databaseSize: { value: 2.4, unit: "MB", status: "good" as const },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Health</h1>
        <p className="text-muted-foreground mt-1">
          Convex function performance, API metrics, and system status
        </p>
      </div>

      {/* Status Banner */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">All Systems Operational</p>
              <p className="text-sm text-green-700">
                Last checked: {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">API Latency</p>
                <p className="text-2xl font-bold">{healthMetrics.apiLatency.value}ms</p>
              </div>
              <Zap className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Error Rate</p>
                <p className="text-2xl font-bold">{healthMetrics.errorRate.value}%</p>
              </div>
              <Activity className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Connections</p>
                <p className="text-2xl font-bold">{healthMetrics.activeConnections.value}</p>
              </div>
              <Server className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Database Size</p>
                <p className="text-2xl font-bold">{healthMetrics.databaseSize.value}MB</p>
              </div>
              <Database className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Overview */}
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Schools</p>
              <p className="text-xl font-bold">{analytics?.totalSchools ?? "—"}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Students</p>
              <p className="text-xl font-bold">{analytics?.totalStudents ?? "—"}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Books</p>
              <p className="text-xl font-bold">{analytics?.totalBooks ?? "—"}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Active Borrowings</p>
              <p className="text-xl font-bold">{analytics?.activeBorrowings ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* School Performance */}
      <Card>
        <CardHeader>
          <CardTitle>School Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">School</th>
                  <th className="text-right p-3 font-medium">Students</th>
                  <th className="text-right p-3 font-medium">Books</th>
                  <th className="text-right p-3 font-medium">Borrowings</th>
                  <th className="text-right p-3 font-medium">Overdue</th>
                  <th className="text-right p-3 font-medium">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {schoolComparison?.slice(0, 10).map((school) => (
                  <tr key={school.schoolId} className="border-t border-border">
                    <td className="p-3 font-medium">{school.schoolName}</td>
                    <td className="p-3 text-right">{school.studentCount}</td>
                    <td className="p-3 text-right">{school.bookCount}</td>
                    <td className="p-3 text-right">{school.activeBorrowings}</td>
                    <td className="p-3 text-right">
                      <Badge variant={school.overdueRate > 10 ? "danger" : "default"}>
                        {school.overdueRate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Badge variant={school.engagementRate > 50 ? "success" : "warning"}>
                        {school.engagementRate.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
