"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Users, BookOpen, Activity, Server,
  Clock, CheckCircle2, AlertTriangle, TrendingUp,
} from "lucide-react";

export default function DevAdminOverview() {
  const schools = useQuery(api.schools.list);
  const analytics = useQuery(api.analytics.systemOverview);

  const totalSchools = schools?.length ?? 0;
  const activeSchools = schools?.filter((s) => !s.status || s.status === "active").length ?? 0;
  const suspendedSchools = schools?.filter((s) => s.status === "suspended").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Developer Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Internal engineering tools — release management, school metadata, system health
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Schools</p>
                <p className="text-2xl font-bold">{totalSchools}</p>
              </div>
              <Building2 className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Schools</p>
                <p className="text-2xl font-bold text-green-600">{activeSchools}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-bold">{analytics?.totalStudents ?? "—"}</p>
              </div>
              <Users className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Borrowings</p>
                <p className="text-2xl font-bold">{analytics?.activeBorrowings ?? "—"}</p>
              </div>
              <BookOpen className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* School List */}
      <Card>
        <CardHeader>
          <CardTitle>Schools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Slug</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Clerk Org ID</th>
                </tr>
              </thead>
              <tbody>
                {schools?.map((school) => (
                  <tr key={school._id} className="border-t border-border">
                    <td className="p-3 font-medium">{school.name}</td>
                    <td className="p-3 text-muted-foreground">{school.slug}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          school.status === "suspended"
                            ? "danger"
                            : school.status === "trial"
                              ? "warning"
                              : "success"
                        }
                      >
                        {school.status ?? "active"}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground font-mono text-xs">
                      {school.clerkOrgId.slice(0, 12)}...
                    </td>
                  </tr>
                ))}
                {(!schools || schools.length === 0) && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No schools found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <a
              href="/dev-admin/releases"
              className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Manage Releases</p>
                <p className="text-xs text-muted-foreground">Feature flags and staging</p>
              </div>
            </a>
            <a
              href="/dev-admin/health"
              className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <Server className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">System Health</p>
                <p className="text-xs text-muted-foreground">Convex function performance</p>
              </div>
            </a>
            <a
              href="/dev-admin/schools"
              className="flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">School Metadata</p>
                <p className="text-xs text-muted-foreground">Config and feature status</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
