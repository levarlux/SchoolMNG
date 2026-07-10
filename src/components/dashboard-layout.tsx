"use client";

import { useEffect, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useOrganization } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useSchool } from "@/lib/use-school";
import {
  LayoutDashboard, BookOpen, Users, BookMarked, RotateCcw, Settings, Library,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/classes", label: "Classes", icon: BookOpen },
  { href: "/dashboard/students", label: "Students", icon: Users },
  { href: "/dashboard/books", label: "Books", icon: BookOpen },
  { href: "/dashboard/borrow", label: "Borrow Book", icon: BookMarked },
  { href: "/dashboard/returns", label: "Returns", icon: RotateCcw },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
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

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const school = useSchool();
  const { organization } = useOrganization();

  // Apply school brand colors to :root so Tailwind's --color-primary etc. pick them up.
  // document.documentElement is reliable; inline style on a div does NOT cascade through
  // Tailwind v4's @theme-generated CSS custom properties.
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

    // Dynamically update the browser favicon to the school logo
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

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="w-64 border-r border-border bg-card hidden lg:flex flex-col">
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
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
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
        </nav>
        <div className="p-4 border-t border-border flex items-center gap-3">
          <UserButton />
          <span className="text-sm text-muted-foreground truncate">Account</span>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
