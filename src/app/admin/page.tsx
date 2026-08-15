"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Shield, CreditCard, Users, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowRight, Crown, BookOpen, Activity,
  Clock, CheckCircle2, AlertTriangle, School, GraduationCap,
  BarChart3, DollarSign, UserPlus, Settings, Eye, ClipboardList,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useIsSuperadmin } from "@/lib/use-admin";
import Link from "next/link";

export default function AdminOverview() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isSuperadmin = useIsSuperadmin();
  const canQuery = !isLoading && isAuthenticated && isSuperadmin;

  const schools = useQuery(api.schools.list, canQuery ? {} : "skip");
  const admins = useQuery(api.admins.list, canQuery ? {} : "skip");
  const subscriptions = useQuery(api.subscriptions.list, canQuery ? {} : "skip");

  const stats = [
    {
      label: "Total Schools",
      value: schools?.length ?? 0,
      icon: Building2,
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
      change: "+2 this month",
      changeType: "positive",
    },
    {
      label: "Active Subscriptions",
      value: subscriptions?.filter((s) => s.status === "active").length ?? 0,
      icon: CreditCard,
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      change: `${subscriptions?.length ?? 0} total`,
      changeType: "neutral",
    },
    {
      label: "Total Admins",
      value: admins?.length ?? 0,
      icon: Shield,
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
      change: "Platform admins",
      changeType: "neutral",
    },
    {
      label: "Platform Revenue",
      value: `KES ${((subscriptions?.filter((s) => s.status === "active").length ?? 0) * 25).toLocaleString()}`,
      icon: DollarSign,
      bgColor: "bg-amber-50",
      textColor: "text-amber-600",
      change: "Monthly estimate",
      changeType: "neutral",
    },
  ];

  const quickActions = [
    {
      label: "Manage Schools",
      description: "View, edit, or remove schools",
      icon: Building2,
      href: "/admin/schools",
      color: "bg-blue-500",
    },
    {
      label: "Manage Admins",
      description: "Add or remove platform admins",
      icon: Shield,
      href: "/admin/admins",
      color: "bg-purple-500",
    },
    {
      label: "Subscriptions",
      description: "View billing and plans",
      icon: CreditCard,
      href: "/admin/subscriptions",
      color: "bg-green-500",
    },
    {
      label: "Tier Management",
      description: "Configure pricing tiers",
      icon: Crown,
      href: "/admin/tiers",
      color: "bg-amber-500",
    },
  ];

  const recentSchools = schools?.slice(0, 5) ?? [];

  if (schools === undefined || admins === undefined || subscriptions === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back. Here&apos;s what&apos;s happening across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/schools">
            <Button size="sm">
              <School className="h-4 w-4 mr-2" />
              View Schools
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="relative overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                    <div className="flex items-center gap-1">
                      {stat.changeType === "positive" && (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      )}
                      <p className="text-xs text-muted-foreground">{stat.change}</p>
                    </div>
                  </div>
                  <div className={`p-2.5 rounded-xl ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.textColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href}>
                <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${action.color} text-white shrink-0`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">
                          {action.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content Grid - Schools + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Schools */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recent Schools</h3>
              <Link href="/admin/schools" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentSchools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No schools yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentSchools.map((school) => (
                  <div
                    key={school._id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: school.primaryColor || "#6366f1" }}
                    >
                      {school.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{school.name}</p>
                      <p className="text-xs text-muted-foreground">/{school.slug}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">API Status</span>
                </div>
                <Badge variant="success" className="text-xs">Operational</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Database</span>
                </div>
                <Badge variant="success" className="text-xs">Healthy</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Auth (Clerk)</span>
                </div>
                <Badge variant="success" className="text-xs">Connected</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Payments</span>
                </div>
                <Badge variant="success" className="text-xs">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">AI Assistant</span>
                </div>
                <Badge variant="default" className="text-xs">Ready</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Summary */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold">Platform Summary</h3>
              <p className="text-sm text-muted-foreground">
                {schools.length} schools • {admins.length} admins • {subscriptions.filter((s) => s.status === "active").length} active subscriptions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/analytics">
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Button>
              </Link>
              <Link href="/admin/audit-log">
                <Button variant="outline" size="sm">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Audit Log
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
