"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/clerk-react";
import { RequireAuth } from "@/components/require-auth";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AdminAuditNotifier } from "@/components/admin-audit-notifier";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Shield, CreditCard, ToggleLeft, BarChart3, Menu, ClipboardList, Crown, Settings,
} from "lucide-react";
import { useIsSuperadmin } from "@/lib/use-admin";

const managementNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/schools", label: "Schools", icon: Building2 },
  { href: "/admin/admins", label: "Admins", icon: Shield },
  { href: "/admin/subscriptions", label: "Billing", icon: CreditCard },
  { href: "/admin/tiers", label: "Tiers", icon: Crown },
];

const systemNav = [
  { href: "/admin/features", label: "Features", icon: ToggleLeft },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/audit-log", label: "Audit Log", icon: ClipboardList },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminSidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">Super Admin</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Console</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Management</p>
        {managementNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">System</p>
        {systemNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
          <UserButton />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">Account</p>
            <p className="text-[10px] text-muted-foreground">Superadmin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSuperadmin = useIsSuperadmin();
  const ensureSuperadmin = useMutation(api.admins.ensureSuperadmin);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-bootstrap: create admins record if JWT says superadmin but none exists
  useEffect(() => {
    if (isSuperadmin) {
      ensureSuperadmin().catch(() => {});
    }
  }, [isSuperadmin, ensureSuperadmin]);

  // Close mobile sidebar on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    if (mobileOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <RequireAuth>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="w-60 border-r border-border bg-card/50 backdrop-blur-sm hidden lg:flex flex-col shrink-0">
        <AdminSidebarNav pathname={pathname} />
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-card border-r border-border lg:hidden transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <AdminSidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-sm">Super Admin</span>
          <UserButton />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-8 max-w-7xl mx-auto">
            <AdminAuditNotifier />
            {isSuperadmin === undefined ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : isSuperadmin === false ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Access denied. Super admin privileges required.</p>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
    </RequireAuth>
  );
}
