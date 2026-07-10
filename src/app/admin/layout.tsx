"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Shield, CreditCard, ToggleLeft, Library,
} from "lucide-react";
import { useIsSuperadmin } from "@/lib/use-admin";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/schools", label: "Schools", icon: Building2 },
  { href: "/admin/admins", label: "Admins", icon: Shield },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/features", label: "Features", icon: ToggleLeft },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSuperadmin = useIsSuperadmin();

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="w-64 border-r border-border bg-card hidden lg:flex flex-col">
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
      </aside>
      <main className="flex-1 p-8">
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
  );
}
