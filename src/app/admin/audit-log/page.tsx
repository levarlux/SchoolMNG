"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Shield, Search, User, Building2, Clock, Filter, Download, CheckCircle2, XCircle, AlertTriangle, Plus, Pencil, Trash2, Ban, ArrowUpRight, Activity, Calendar } from "lucide-react";
import { exportToCsv } from "@/lib/csv-export";

const ACTION_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  school_create: { label: "School Created", icon: Plus, color: "text-blue-600", bg: "bg-blue-50" },
  school_update: { label: "School Updated", icon: Pencil, color: "text-purple-600", bg: "bg-purple-50" },
  school_remove: { label: "School Deleted", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
  school_suspend: { label: "School Suspended", icon: Ban, color: "text-orange-600", bg: "bg-orange-50" },
  school_reactivate: { label: "School Reactivated", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  tier_override: { label: "Tier Override", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
  admin_create: { label: "Admin Added", icon: Plus, color: "text-blue-600", bg: "bg-blue-50" },
  admin_remove: { label: "Admin Removed", icon: Trash2, color: "text-red-600", bg: "bg-red-50" },
};

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminAuditLogPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");

  const entries = useQuery(api.platformAudit.listEntries, {
    limit: 200,
    action: actionFilter || undefined,
  });

  const stats = useQuery(api.platformAudit.getStats);

  if (entries === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  // Apply time filter
  const now = Date.now();
  const timeFiltered = entries.filter((e) => {
    if (timeFilter === "all") return true;
    if (timeFilter === "1h") return e.timestamp >= now - 3600000;
    if (timeFilter === "24h") return e.timestamp >= now - 86400000;
    if (timeFilter === "7d") return e.timestamp >= now - 604800000;
    if (timeFilter === "30d") return e.timestamp >= now - 2592000000;
    return true;
  });

  // Apply search filter
  const filtered = timeFiltered.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      (e.adminEmail ?? "").toLowerCase().includes(q) ||
      (e.targetSchoolName ?? "").toLowerCase().includes(q) ||
      (e.reason ?? "").toLowerCase().includes(q)
    );
  });

  // Get unique actions for filter
  const uniqueActions = [...new Set(entries.map((e) => e.action))].sort() as string[];

  // Stats
  const last24h = entries.filter((e) => e.timestamp >= now - 86400000).length;
  const uniqueAdmins = new Set(entries.map((e) => e.adminUserId)).size;
  const uniqueSchools = new Set(entries.filter((e) => e.targetSchoolId).map((e) => e.targetSchoolId)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track all superadmin actions across the platform
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const rows = filtered.map((e) => ({
              Timestamp: new Date(e.timestamp).toISOString(),
              Admin: e.adminEmail ?? e.adminUserId,
              Action: e.action,
              School: e.targetSchoolName ?? "",
              Reason: e.reason ?? "",
            }));
            exportToCsv(rows, "platform_audit_log");
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Activity className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{entries.length}</p>
                <p className="text-xs text-muted-foreground">Total Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Clock className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{last24h}</p>
                <p className="text-xs text-muted-foreground">Last 24h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <User className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{uniqueAdmins}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Building2 className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{uniqueSchools}</p>
                <p className="text-xs text-muted-foreground">Schools</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by action, admin, school, or reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="w-full sm:w-48">
              <option value="">All Actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
            <Select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="w-full sm:w-36">
              <option value="all">All Time</option>
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </Select>
          </div>
          {(search || actionFilter || timeFilter !== "all") && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {search && (
                <Badge variant="outline" className="text-xs">
                  Search: "{search}"
                  <button onClick={() => setSearch("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {actionFilter && (
                <Badge variant="outline" className="text-xs">
                  Action: {actionFilter}
                  <button onClick={() => setActionFilter("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {timeFilter !== "all" && (
                <Badge variant="outline" className="text-xs">
                  Time: {timeFilter}
                  <button onClick={() => setTimeFilter("all")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              <button
                onClick={() => { setSearch(""); setActionFilter(""); setTimeFilter("all"); }}
                className="text-xs text-primary hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Timeline */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No audit entries found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((entry) => {
                const config = ACTION_CONFIG[entry.action];
                const Icon = config?.icon ?? Activity;

                return (
                  <div key={entry._id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config?.bg ?? "bg-muted"}`}>
                      <Icon className={`h-4 w-4 ${config?.color ?? "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{entry.adminEmail ?? entry.adminUserId.slice(0, 12)}</span>
                        <Badge variant="outline" className="text-xs">
                          {config?.label ?? entry.action}
                        </Badge>
                        {entry.targetSchoolName && (
                          <span className="text-sm text-muted-foreground">
                            → {entry.targetSchoolName}
                          </span>
                        )}
                      </div>
                      {entry.reason && (
                        <p className="text-xs text-muted-foreground mt-1">{entry.reason}</p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(entry.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
