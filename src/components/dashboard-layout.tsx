"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useOrganization, useClerk } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { GlobalSearch } from "./global-search";
import { DashboardNav } from "./dashboard-nav";
import { Button } from "@/components/ui/button";
import { Menu, Clock, ChevronsLeft, ChevronsRight, Ban } from "lucide-react";
import { NotificationBell } from "./notification-bell";
import { AiChat } from "./ai-chat";
import { GuidedTour } from "./guided-tour";
import { buildPart1Steps, buildPart2Steps, type NavGroup } from "@/lib/guided-tour-steps";

function schoolInitials(name?: string): string {
  if (!name) return "SC";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SC";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function hexToLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrastText(hex: string) {
  return hexToLuminance(hex) > 0.5 ? "#0f172a" : "#ffffff";
}

/**
 * Phase 2.3 — two-part guided tour, server-backed via `tour_states`.
 *
 * - Auto-fires after onboarding: fresh members get Part 1 (workspace
 *   showcase), which hands off to Part 2 (per-module walkthrough).
 * - X / backdrop / Esc dismisses the ENTIRE tour permanently.
 * - Settings can restart it via the `schoolmng:start-tour` event.
 */
function GuidedTourMount() {
  const school = useSchool();
  const role = useRole();
  const tourState = useQuery(
    api.tour.getTourState,
    school ? { schoolId: school._id } : "skip"
  );
  const navTree = useQuery(
    api.nav.getNavTree,
    school ? { schoolId: school._id } : "skip"
  );
  const updateTour = useMutation(api.tour.updateTourState);

  const [active, setActive] = useState<"part1" | "part2" | null>(null);

  const groups = useMemo(() => (navTree?.groups ?? []) as NavGroup[], [navTree]);
  const part1Steps = useMemo(() => buildPart1Steps(school?.name ?? "School", groups), [school, groups]);
  const part2Steps = useMemo(() => buildPart2Steps(groups), [groups]);

  const ready = !!school && role !== null && tourState !== undefined && navTree !== undefined;

  // Auto-fire: resume the part in progress, or start Part 1 for a fresh member.
  useEffect(() => {
    if (!ready) return;
    if (!tourState) {
      setActive("part1");
      return;
    }
    if (tourState.dismissed) return;
    if (tourState.currentPart) {
      setActive(tourState.currentPart);
      return;
    }
    if (!tourState.part1Done) setActive("part1");
  }, [ready, tourState]);

  // Manual restart from Settings.
  useEffect(() => {
    const start = () => setActive("part1");
    window.addEventListener("schoolmng:start-tour", start as EventListener);
    return () => window.removeEventListener("schoolmng:start-tour", start as EventListener);
  }, []);

  if (!school || !ready) return null;
  const schoolId = school._id;

  function handlePart1Finish() {
    if (part2Steps.length === 0) {
      void updateTour({ schoolId, completePart: "part2" });
      setActive(null);
      return;
    }
    void updateTour({ schoolId, completePart: "part1", part: "part2" });
    setActive("part2");
  }

  function handlePart2Finish() {
    void updateTour({ schoolId, completePart: "part2" });
    setActive(null);
  }

  function handleDismiss() {
    void updateTour({ schoolId, dismissed: true });
    setActive(null);
  }

  return (
    <>
      <GuidedTour
        key="part1"
        open={active === "part1"}
        steps={part1Steps}
        onFinish={handlePart1Finish}
        onDismiss={handleDismiss}
        partLabel="Part 1 — Workspace"
      />
      <GuidedTour
        key="part2"
        open={active === "part2"}
        steps={part2Steps}
        onFinish={handlePart2Finish}
        onDismiss={handleDismiss}
        partLabel="Part 2 — Modules"
      />
    </>
  );
}

function HeaderClock() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "short" });
  const day = now.getDate();
  const year = now.getFullYear();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-2.5 text-right text-sm">
      <div className="min-w-[120px] text-right">
        <p className="font-medium text-foreground">{weekday}, {month} {day}, {year}</p>
        <p className="text-xs text-muted-foreground font-mono tabular-nums">{time}</p>
      </div>
      <Clock className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

type SchoolGreetingProps = { school: { name?: string; logoUrl?: string } | null };

function SchoolGreeting({ school }: SchoolGreetingProps) {
  const hour = new Date().getHours();
  const period =
    hour < 12 ? "Good morning" :
    hour < 18 ? "Good afternoon" :
    "Good evening";

  return (
    <div className="flex items-center gap-3">
      {school?.logoUrl ? (
        <img src={school.logoUrl} alt={school.name ?? "School"} className="h-8 w-auto object-contain" />
      ) : (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#f97316] flex items-center justify-center shrink-0">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l7-7m0 0l-7 7m7-7H9" /></svg>
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-foreground">{period}, {school?.name ?? "School"}</p>
        <p className="text-xs text-muted-foreground">Manage your school in one place</p>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const school = useSchool();
  const { organization } = useOrganization();
  const role = useRole();

  return (
    <>
      <div
        className={cn(
          "border-b border-secondary/20 bg-secondary/5 shrink-0",
          collapsed ? "flex flex-col items-center justify-center gap-3 p-4" : "p-6"
        )}
      >
        <div className={cn("flex items-center gap-2.5", !collapsed && "w-full")}>
          {school?.logoUrl ? (
            <img src={school.logoUrl} alt={school.name} className="h-9 w-auto object-contain" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#f97316] flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-white tracking-wide">
                {schoolInitials(school?.name || organization?.name)}
              </span>
            </div>
          )}
          {!collapsed && (
            <span className="font-bold text-lg truncate flex-1">
              {school?.name || organization?.name || "School Library"}
            </span>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title={collapsed ? "Expand menu" : "Collapse menu"}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {null}
      </div>

      <DashboardNav pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />

      <div
        className={cn(
          "border-t border-border flex items-center gap-3 shrink-0",
          collapsed ? "p-3 justify-center" : "p-4"
        )}
      >
        <UserButton />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <span className="text-sm text-muted-foreground truncate block">Account</span>
            {role && role !== null && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                {role}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const school = useSchool();
  const role = useRole();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // ── Scroll restoration ─────────────────────────────────────────────
  // The sidebar and header are fixed; only <main> scrolls. Save each page's
  // scroll position as the user scrolls and restore it when coming back, so
  // you never lose your place when jumping between nav sections.
  const mainRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});

  // Record continuously. Saving in an effect cleanup is too late: the new
  // (short, skeleton) page is already mounted by then and the browser has
  // clamped scrollTop to 0, so the previous position would be lost.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => {
      scrollPositions.current[pathname] = main.scrollTop;
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Restore: page content mounts asynchronously (Convex queries → skeletons),
  // so at the moment we restore, scrollHeight may still be tiny and the
  // browser clamps scrollTop to 0, losing the user's place. Watch the scroll
  // container with a ResizeObserver and apply the saved position the moment
  // it is tall enough to hold it; fall back to a bounded timer.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const target = scrollPositions.current[pathname] ?? 0;
    if (target <= 0) return;
    let ro: ResizeObserver | null = null;
    let done = false;
    const apply = () => {
      const el = mainRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll >= target) {
        el.scrollTop = Math.min(target, maxScroll);
        scrollPositions.current[pathname] = el.scrollTop;
        done = true;
        ro?.disconnect();
      }
    };
    apply();
    if (!done) {
      ro = new ResizeObserver(apply);
      ro.observe(main);
      const id = window.setTimeout(() => {
        const el = mainRef.current;
        if (el) {
          el.scrollTop = Math.min(target, Math.max(el.scrollHeight - el.clientHeight, 0));
          scrollPositions.current[pathname] = el.scrollTop;
        }
        ro?.disconnect();
      }, 4000);
      return () => {
        ro?.disconnect();
        window.clearTimeout(id);
      };
    }
  }, [pathname]);

  // Access-lifecycle gate: a suspended member can log in but sees the
  // head's message and cannot access anything (queries reject them too).
  const membership = useQuery(
    api.members.getMyMembership,
    school ? { schoolId: school._id } : "skip"
  );

  // Onboarding check — redirect to onboarding if school has no students
  const students = useQuery(
    api.students.listBySchool,
    school && isLeadershipRole(role) ? { schoolId: school._id } : "skip"
  );
  // Don't re-trigger onboarding once it has been completed (students may
  // legitimately be zero after a wizard run with no import).
  const onboardingSession = useQuery(
    api.onboarding.getSession,
    school && isLeadershipRole(role) ? { schoolId: school._id } : "skip"
  );
  const onboardingDone = onboardingSession?.status === "completed";
  const hasCheckedOnboarding = useState(false);
  useEffect(() => {
    // Only redirect once BOTH queries have resolved. The session query often
    // resolves a beat after students; redirecting before it does sends a
    // principal who already finished onboarding straight back to the wizard.
    if (
      students !== undefined &&
      onboardingSession !== undefined &&
      students.length === 0 &&
      !onboardingDone &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/admin")
    ) {
      // Only redirect if not already on onboarding
      router.replace("/onboarding");
    }
  }, [students, onboardingSession, onboardingDone, pathname, router]);

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

  // ── Suspended access gate ────────────────────────────────────────
  if (membership?.status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
            <Ban className="h-8 w-8 text-red-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Access suspended</h1>
            <p className="text-muted-foreground">
              {membership.statusMessage ??
                "The school head has suspended your access to this school."}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Contact the school head if you believe this is a mistake.
            </p>
          </div>
          <Button onClick={() => signOut()} variant="outline">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    // Fixed 100vh shell: the header and sidebar stay put, only the inner
    // panes (sidebar nav / page content) scroll — independently.
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "border-r border-border bg-card hidden lg:flex flex-col shrink-0 transition-[width] duration-200",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarNav
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop top bar with global student search — fixed, never scrolls */}
        <header className="hidden lg:flex items-center justify-between gap-4 p-4 border-b border-border bg-card shrink-0">
          <SchoolGreeting school={school} />
          <div className="flex-1 flex items-center justify-end gap-3">
            <NotificationBell />
            <GlobalSearch />
          </div>
          <HeaderClock />
        </header>

        {/* Mobile top bar — fixed, never scrolls */}
        <header className="lg:hidden shrink-0 bg-card border-b border-border">
          <div className="flex items-center justify-between p-4">
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
          <div className="px-4 pb-3">
            <GlobalSearch />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-8">{children}</main>

        {/* AI Chat FAB */}
        <AiChat />

        {/* Phase 2.3 — two-part guided tour */}
        <GuidedTourMount />
      </div>
    </div>
  );
}
