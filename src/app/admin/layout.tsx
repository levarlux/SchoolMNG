"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Shield, CreditCard, ToggleLeft, Library, BarChart3, Menu,
} from "lucide-react";
import { useIsSuperadmin } from "@/lib/use-admin";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/schools", label: "Schools", icon: Building2 },
  { href: "/admin/admins", label: "Admins", icon: Shield },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/features", label: "Features", icon: ToggleLeft },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

function AdminSidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 p-6 border-b border-secondary/20 bg-secondary/5">
        <Library className="h-6 w-6 text-secondary" />
        <span className="font-bold text-lg">Super Admin</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 border-transparent",
                active
                  ? "bg-secondary/10 text-primary border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border flex items-center gap-3">
        <UserButton />
        <span className="text-sm text-muted-foreground truncate">Account</span>
      </div>
    </>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSuperadmin = useIsSuperadmin();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="w-64 border-r border-border bg-card hidden lg:flex flex-col">
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
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-30">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-bold text-sm">Super Admin</span>
          <UserButton />
        </div>

        <main className="flex-1 p-4 lg:p-8">
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
        </main>
      </div>
    </div>
  );
}
