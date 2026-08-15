"use client";

import { ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Flag, Building2, Activity, Settings, Shield, AlertTriangle } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

const NAV_ITEMS = [
  { href: "/dev-admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dev-admin/releases", label: "Releases", icon: Flag },
  { href: "/dev-admin/schools", label: "Schools", icon: Building2 },
  { href: "/dev-admin/health", label: "Health", icon: Activity },
  { href: "/dev-admin/flags", label: "Feature Flags", icon: Flag },
];

export default function DevAdminLayout({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  // Check dev_admin permission
  const isDevAdmin = (user?.publicMetadata as any)?.dev_admin === true;

  useEffect(() => {
    if (isLoaded && !isDevAdmin) {
      router.push("/dashboard");
    }
  }, [isLoaded, isDevAdmin, router]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <BrandLoader variant="book" size="lg" />
      </div>
    );
  }

  if (!isDevAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access the Developer Admin Dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold">Dev Admin</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Engineering Dashboard
          </p>
        </div>
        <nav className="p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 w-64 p-4 border-t border-border">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Back to School App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
