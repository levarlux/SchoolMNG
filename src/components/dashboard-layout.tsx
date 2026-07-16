"use client";

import { useEffect, useState, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useOrganization } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { useSchool } from "@/lib/use-school";
import { useRole, isAtLeast, type MemberRole } from "@/lib/use-role";
import {
  LayoutDashboard, BookOpen, Users, BookMarked, RotateCcw, Settings, Library, CircleDollarSign, FileText, Menu, X,
  GraduationCap, UserCheck, Calendar, ClipboardList, Clock, Package, BookCopy,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  group?: string;
  minRole?: MemberRole;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/classes", label: "Classes", icon: BookOpen, group: "Academics", minRole: "principal" },
  { href: "/dashboard/students", label: "Students", icon: Users, group: "Academics" },
  { href: "/dashboard/subjects", label: "Subjects", icon: BookCopy, group: "Academics", minRole: "principal" },
  { href: "/dashboard/teachers", label: "Teachers", icon: GraduationCap, group: "Academics", minRole: "principal" },
  { href: "/dashboard/terms", label: "Terms", icon: Calendar, group: "Academics", minRole: "principal" },
  { href: "/dashboard/exams", label: "Exams", icon: ClipboardList, group: "Assessments", minRole: "principal" },
  { href: "/dashboard/attendance", label: "Attendance", icon: UserCheck, group: "Assessments" },
  { href: "/dashboard/books", label: "Books", icon: BookOpen, group: "Library" },
  { href: "/dashboard/borrow", label: "Borrow Book", icon: BookMarked, group: "Library" },
  { href: "/dashboard/returns", label: "Returns", icon: RotateCcw, group: "Library" },
  { href: "/dashboard/fines", label: "Fines", icon: CircleDollarSign, group: "Library" },
  { href: "/dashboard/timetable", label: "Timetable", icon: Clock, group: "Operations", minRole: "principal" },
  { href: "/dashboard/events", label: "Events", icon: Calendar, group: "Operations" },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package, group: "Operations", minRole: "principal" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, minRole: "principal" },
  { href: "/dashboard/members", label: "Members", icon: Users, minRole: "principal" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, minRole: "principal" },
];

function hexToLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrastText(hex: string) {
  return hexToLuminance(hex) > 0.5 ? "#0f172a" : "#ffffff";
}

function SidebarNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const school = useSchool();
  const { organization } = useOrganization();
  const role = useRole();

  // Filter nav items by role
  const visibleItems = role === undefined || role === null
    ? navItems // still loading or no membership — show all
    : navItems.filter((item) => !item.minRole || isAtLeast(role, item.minRole));

  const groups: { label: string; items: NavItem[] }[] = [];
  let currentGroup: { label: string; items: NavItem[] } | null = null;

  for (const item of visibleItems) {
    if (item.group) {
      if (!currentGroup || currentGroup.label !== item.group) {
        currentGroup = { label: item.group, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    } else {
      currentGroup = null;
      groups.push({ label: "", items: [item] });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 p-6 border-b border-secondary/20 bg-secondary/5">
        {school?.logoUrl ? (
          <img src={school.logoUrl} alt={school.name} className="h-8 w-auto object-contain" />
        ) : (
          <Library className="h-6 w-6 text-secondary" />
        )}
        <span className="font-bold text-lg">
          {school?.name || organization?.name || "School Library"}
        </span>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/dashboard"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 border-transparent",
                    active
                      ? "bg-secondary/10 text-primary border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-border flex items-center gap-3">
        <UserButton />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground truncate block">Account</span>
          {role && role !== null && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {role}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const school = useSchool();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!school) return;
    const root = document.documentElement;
    root.style.setProperty("--school-primary", school.primaryColor);
    root.style.setProperty(
      "--school-primary-foreground",
      contrastText(school.primaryColor)
    );
    root.style.setProperty("--school-secondary", school.secondaryColor);
    root.style.setProperty(
      "--school-secondary-foreground",
      contrastText(school.secondaryColor)
    );

    if (school.logoUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = school.logoUrl;
    }
  }, [school]);

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
        <SidebarNav pathname={pathname} />
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
        <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
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
          <span className="font-bold text-sm truncate">
            {school?.name || "School Library"}
          </span>
          <UserButton />
        </div>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
