"use client";

/**
 * Hierarchical dashboard navigation — DB-driven.
 *
 * The sidebar is built from the school's seeded EAV module tree
 * (`nav.getNavTree`): every module the school enabled during onboarding is
 * VISIBLE by default but COLLAPSED. Opening a module reveals its submodules —
 * first the real dashboard pages that back it (Academics → Classes, Exams, …),
 * then the EAV section tree (module → section → subsection drill-down).
 *
 * Modules the school did NOT enable during onboarding are hidden server-side
 * (isEnabled=false), so the nav is prepopulated from what the school chose.
 *
 * Production-affecting pages (Settings, Billing, Members, Permissions,
 * Reports, AI Assistant, …) are always pinned at the bottom.
 *
 * Role gating (minRole) still applies per item; leadership sees everything.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole, type MemberRole } from "@/lib/use-role";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, Sparkles, Layers, Package, Calendar, Shield,
  Users, CreditCard, Settings as SettingsIcon, ChevronDown, FolderOpen, BarChart3,
  Pin, PinOff, EyeOff, Eye, Search, X,
  type LucideIcon,
} from "lucide-react";

/** lucide icon name → component (matches `modules.icon` seeded by seedFullTree). */
const MODULE_ICONS: Record<string, LucideIcon> = {
  Users, Shield, FileText, Calendar,
  BookOpen: FolderOpen, UserCheck: Users, BookMarked: FolderOpen,
  Heart: FolderOpen, ShieldAlert: Shield, CircleDollarSign: FolderOpen,
  TrendingUp: FolderOpen, MessageSquare: FolderOpen, Trophy: FolderOpen,
  BedDouble: FolderOpen, Bus: FolderOpen, Utensils: FolderOpen,
  GraduationCap: Users, BookOpenCheck: FolderOpen, ClipboardList: FolderOpen,
  Briefcase: FolderOpen, Stethoscope: FolderOpen, Wrench: FolderOpen,
  Bell: FolderOpen, Library: FolderOpen,
};

const DEFAULT_ICON: LucideIcon = FolderOpen;

/** Real dashboard pages that back a module — the module's "submodules". */
interface NavChild {
  label: string;
  href: string;
  minRole?: MemberRole;
}

export const MODULE_CHILDREN: Record<string, NavChild[]> = {
  Academics: [
    { label: "Classes", href: "/dashboard/classes", minRole: "principal" },
    { label: "Subjects", href: "/dashboard/subjects", minRole: "principal" },
    { label: "Teachers", href: "/dashboard/teachers", minRole: "principal" },
    { label: "Terms", href: "/dashboard/terms" },
    { label: "Timetable", href: "/dashboard/timetable" },
    { label: "Exams", href: "/dashboard/exams" },
  ],
  Library: [
    { label: "Books", href: "/dashboard/books" },
    { label: "Borrow Book", href: "/dashboard/borrow" },
    { label: "Returns", href: "/dashboard/returns" },
    { label: "Fines", href: "/dashboard/fines" },
    { label: "Book Holds", href: "/dashboard/book-holds", minRole: "principal" },
  ],
  "Health/Welfare": [
    { label: "Health", href: "/dashboard/health", minRole: "principal" },
    { label: "Medical", href: "/dashboard/medical", minRole: "principal" },
    { label: "Boarding", href: "/dashboard/boarding", minRole: "principal" },
    { label: "Feeding", href: "/dashboard/feeding", minRole: "principal" },
  ],
  Finance: [
    { label: "School Fees", href: "/dashboard/fees", minRole: "principal" },
    { label: "Expenditures", href: "/dashboard/expenditures", minRole: "principal" },
    { label: "Payroll", href: "/dashboard/payroll", minRole: "principal" },
  ],
  Communication: [
    { label: "Parent Meetings", href: "/dashboard/parent-meetings" },
    { label: "Guardians", href: "/dashboard/guardians", minRole: "principal" },
    { label: "Announcements", href: "/dashboard/announcements" },
    { label: "Notifications", href: "/dashboard/notifications" },
  ],
};

/** Pinned leaf items not part of the EAV module tree (always visible). */
interface PinnedItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole?: MemberRole;
}

const PINNED_TOP: PinnedItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
];

const PINNED_BOTTOM: PinnedItem[] = [
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "AI Assistant", href: "/dashboard/ai-assistant", icon: Sparkles },
  { label: "Bulk Operations", href: "/dashboard/bulk-operations", icon: Layers, minRole: "principal" },
  { label: "Inventory", href: "/dashboard/inventory", icon: Package, minRole: "principal" },
  { label: "Events", href: "/dashboard/events", icon: Calendar },
  { label: "Permissions", href: "/dashboard/permissions", icon: Shield, minRole: "principal" },
  { label: "Members", href: "/dashboard/members", icon: Users, minRole: "principal" },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard, minRole: "principal" },
  { label: "Settings", href: "/dashboard/settings", icon: SettingsIcon, minRole: "principal" },
];

const STORAGE_KEY = "schoolmng_nav_expanded_v3";
const NAV_STATE_KEY = "schoolmng_nav_state_v1";

/** Slug used for guided-tour DOM targets (`data-tour-module` / `data-tour-group`). */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function canSee(minRole: MemberRole | undefined, role: MemberRole | null | undefined): boolean {
  if (!minRole) return true;
  return role === minRole || isLeadershipRole(role);
}

function isActiveHref(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

interface SectionNode {
  sectionId: string;
  name: string;
  parentId: string | null;
  order: number;
  isEnabled: boolean;
  isRepeatable: boolean;
  isSensitive: boolean;
  subsections: SectionNode[];
}

interface NavModule {
  moduleId: string;
  name: string;
  icon?: string;
  href: string | null;
  sections: SectionNode[];
}

function loadExpanded(pathname: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore corrupt storage */
  }
  return {};
}

interface NavState {
  hidden: Record<string, true>;
  pinned: Record<string, true>;
}

function loadNavState(): NavState {
  try {
    const raw = localStorage.getItem(NAV_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavState>;
      return {
        hidden: parsed.hidden ?? {},
        pinned: parsed.pinned ?? {},
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { hidden: {}, pinned: {} };
}

/**
 * One row in the tree. Never nests interactive elements:
 *  - href + children → Link row + separate chevron button
 *  - href only        → plain Link row
 *  - no href + children → toggle button row (structural: sections/sub-sections)
 */
function TreeRow({
  label,
  icon,
  href,
  isOpen,
  isActive,
  depth,
  onToggle,
  onNavigate,
  children,
  tourId,
  actions,
}: {
  label: string;
  icon?: LucideIcon;
  href?: string | null;
  isOpen: boolean;
  isActive: boolean;
  depth: number;
  onToggle: () => void;
  onNavigate?: () => void;
  children?: ReactNode;
  tourId?: string;
  actions?: ReactNode;
}) {
  const tourAttrs = tourId ? ({ "data-tour-module": tourId } as const) : {};
  const hasChildren = children != null;
  const Icon = icon ?? DEFAULT_ICON;

  const rowClass = cn(
    "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
    depth === 0 ? "px-3 py-2.5" : "px-3 py-1.5 text-[13px]",
    isActive
      ? "bg-secondary/10 text-primary border-l-2 border-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    !hasChildren && "border-l-2 border-transparent",
    (href || hasChildren) && "cursor-pointer"
  );

  const iconSlot =
    depth === 0 ? (
      <Icon className="h-4 w-4 shrink-0" />
    ) : (
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isActive ? "bg-primary" : "bg-muted-foreground/40")} />
    );

  const chevron = hasChildren ? (
    <ChevronDown
      className={cn(
        "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200",
        isOpen && "rotate-180"
      )}
    />
  ) : null;

  const body = (
    <>
      {iconSlot}
      <span className="truncate flex-1">{label}</span>
      {chevron}
    </>
  );

  const childList = hasChildren && isOpen ? (
    <div className={cn("mt-0.5 space-y-0.5", depth < 2 ? "ml-3 pl-3 border-l border-border/70" : "ml-3 pl-2")}>
      {children}
    </div>
  ) : null;

  // Navigable with children: Link row + standalone chevron toggle + actions.
  if (href && hasChildren) {
    return (
      <div {...tourAttrs} className="group">
        <div className={cn(rowClass, "pr-1")}>
          <Link
            href={href}
            onClick={onNavigate}
            title={label}
            className="flex items-center gap-3 min-w-0 flex-1 py-1.5"
          >
            {iconSlot}
            <span className="truncate flex-1">{label}</span>
          </Link>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
            className="p-1 rounded-md hover:bg-muted"
          >
            {chevron}
          </button>
          {actions}
        </div>
        {childList}
      </div>
    );
  }

  // Navigable leaf: plain link.
  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        title={label}
        {...tourAttrs}
        className={cn(rowClass, "border-l-2 border-transparent")}
      >
        {body}
      </Link>
    );
  }

  // Structural (sections/sub-sections): toggle button when it has children,
  // otherwise a plain (non-interactive) row.
  if (hasChildren) {
    return (
      <div {...tourAttrs} className="group">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          title={label}
          className={cn(rowClass, "w-full text-left")}
        >
          {body}
        </button>
        {childList}
      </div>
    );
  }

  return <div {...tourAttrs} className={cn(rowClass, "w-full")}>{body}</div>;
}

/**
 * Pin / hide controls shown on hover for module rows.
 */
function RowActions({
  pinned,
  onPin,
  onHide,
}: {
  pinned: boolean;
  onPin: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onPin}
        title={pinned ? "Unpin from top" : "Pin to top"}
        className={cn("p-1 rounded-md hover:bg-muted", pinned && "text-primary")}
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onHide}
        title="Hide from nav"
        className="p-1 rounded-md hover:bg-muted text-muted-foreground/70 hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Leaf row with hover actions (pin / hide) plus the standard navigation link.
 * Used for pinned module shortcuts and leaf modules (modules with no children
 * or sections). When `collapsed`, only the icon shows and actions are dropped.
 */
function LeafRow({
  label,
  href,
  icon,
  isActive,
  collapsed,
  depth,
  onNavigate,
  pinned,
  onPin,
  onHide,
  tourId,
}: {
  label: string;
  href: string;
  icon?: LucideIcon;
  isActive: boolean;
  collapsed?: boolean;
  depth: number;
  onNavigate?: () => void;
  pinned: boolean;
  onPin: () => void;
  onHide: () => void;
  tourId?: string;
}) {
  const tourAttrs = tourId ? ({ "data-tour-module": tourId } as const) : {};
  const Icon = icon ?? DEFAULT_ICON;

  if (collapsed) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        title={label}
        {...tourAttrs}
        className={cn(
          "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors border-l-2",
          isActive
            ? "bg-secondary/10 text-primary border-l-2 border-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  return (
    <div
      {...tourAttrs}
      className={cn(
        "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
        isActive
          ? "bg-secondary/10 text-primary border-l-2 border-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent",
        depth === 0 ? "px-3 py-2.5" : "px-3 py-1.5 text-[13px]"
      )}
    >
      <Link
        href={href}
        onClick={onNavigate}
        title={label}
        className="flex items-center gap-3 min-w-0 flex-1 py-1"
      >
        {depth === 0 ? (
          <Icon className="h-4 w-4 shrink-0" />
        ) : (
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isActive ? "bg-primary" : "bg-muted-foreground/40")} />
        )}
        <span className="truncate flex-1">{label}</span>
      </Link>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onPin}
          title={pinned ? "Unpin from top" : "Pin to top"}
          className={cn("p-1 rounded-md hover:bg-muted", pinned && "text-primary")}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onHide}
          title="Hide from nav"
          className="p-1 rounded-md hover:bg-muted text-muted-foreground/70 hover:text-foreground"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function DashboardNav({
  pathname,
  onNavigate,
  collapsed = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const school = useSchool();
  const role = useRole();
  const navTree = useQuery(
    api.nav.getNavTree,
    school ? { schoolId: school._id } : "skip"
  );

  // ── Sidebar scroll preservation ───────────────────────────────────
  // The module tree is its own scrollable region. Navigating resets it to the
  // top, so a head who scrolled down to a section loses their place. Save the
  // nav's scroll position per page and restore it on return; on a fresh visit
  // scroll the active item into view instead.
  const navRef = useRef<HTMLElement>(null);
  const navScroll = useRef<Record<string, number>>({});

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const onScroll = () => {
      navScroll.current[pathname] = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = navScroll.current[pathname] ?? 0;
    if (saved > 0) {
      // The tree grows as queries land (skeletons → real rows), so retry until
      // the content is tall enough to hold the saved position.
      let tries = 0;
      const attempt = () => {
        const max = el.scrollHeight - el.clientHeight;
        if (max >= saved || tries >= 15) {
          el.scrollTop = Math.min(saved, Math.max(max, 0));
        } else {
          tries++;
          requestAnimationFrame(attempt);
        }
      };
      requestAnimationFrame(attempt);
      return;
    }
    // Fresh visit — keep the current section visible in the sidebar.
    const links = el.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      if (isActiveHref(pathname, href)) {
        a.scrollIntoView({ block: "nearest" });
        break;
      }
    }
  }, [pathname]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpanded(pathname));
  const [navState, setNavState] = useState<NavState>(() => loadNavState());
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState("");

  const hidden = navState.hidden;
  const pinned = navState.pinned;

  useEffect(() => {
    try {
      localStorage.setItem(NAV_STATE_KEY, JSON.stringify(navState));
    } catch {
      /* storage unavailable */
    }
  }, [navState]);

  const isHidden = (href: string) => !!hidden[href];
  const isPinned = (href: string) => !!pinned[href];

  const setPin = (href: string, on: boolean) =>
    setNavState((prev) => {
      const next = { ...prev, pinned: { ...prev.pinned } };
      if (on) next.pinned[href] = true;
      else delete next.pinned[href];
      return next;
    });

  const setHide = (href: string, on: boolean) =>
    setNavState((prev) => {
      const next = { ...prev, hidden: { ...prev.hidden } };
      if (on) next.hidden[href] = true;
      else delete next.hidden[href];
      return next;
    });

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = (label: string) => label.toLowerCase().includes(q);

  // Auto-expand ancestors of the active page so the current section is never
  // hidden — but only when something actually changes (avoid state churn).
  useEffect(() => {
    const shouldOpen: string[] = [];
    const markModuleOpen = (name: string, href: string | null) => {
      if (href && isActiveHref(pathname, href)) {
        shouldOpen.push(name);
        return true;
      }
      const children = MODULE_CHILDREN[name] ?? [];
      if (children.some((c) => isActiveHref(pathname, c.href))) {
        shouldOpen.push(name);
        return true;
      }
      return false;
    };
    outer: for (const group of navTree?.groups ?? []) {
      for (const m of group.modules) {
        if (markModuleOpen(m.name, m.href)) break outer;
      }
    }
    if (shouldOpen.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const name of shouldOpen) {
        if (!next[name]) {
          next[name] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, navTree]);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Sections link into the module's page (generic records page or dedicated
  // dashboard page), pre-selecting that section. Nested subsections share
  // their root section's target so they always land on a real tab.
  const renderSections = (sections: SectionNode[], depth: number, rootSectionId: string | null, moduleHref: string): ReactNode =>
    sections.map((section) => {
      const root = rootSectionId ?? section.sectionId;
      const href = `${moduleHref}?section=${root}`;
      return (
        <TreeRow
          key={section.sectionId}
          label={section.name}
          href={href}
          isOpen={!!expanded[section.sectionId]}
          isActive={false}
          depth={depth + 1}
          onToggle={() => toggle(section.sectionId)}
          onNavigate={onNavigate}
        >
          {section.subsections.length > 0 && renderSections(section.subsections, depth + 1, root, moduleHref)}
        </TreeRow>
      );
    });

  const renderPinned = (items: PinnedItem[]) => (
    <div className="space-y-0.5">
      {items.map((item) => {
        if (!canSee(item.minRole, role)) return null;
        const active = isActiveHref(pathname, item.href);
        const isAi = item.href === "/dashboard/ai-assistant";
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 border-transparent",
              collapsed && "justify-center px-0",
              isAi
                ? "bg-gradient-to-r from-primary/25 via-primary/10 to-transparent border-l-2 border-primary text-primary shadow-sm"
                : active
                  ? "bg-secondary/10 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className={cn("h-4 w-4 shrink-0", isAi && "h-[18px] w-[18px]")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </div>
  );

  const groups = navTree?.groups ?? [];

  // Master list of root modules so users can pin any module to the top or
  // hide it from the nav. Keyed by the module's landing href (its own href,
  // or its first child's when it has no direct page). Deduped so the same
  // destination can never appear twice.
  const allModuleItems = useMemo(() => {
    const byHref = new Map<string, { label: string; href: string; icon?: LucideIcon }>();
    for (const group of groups) {
      for (const m of group.modules) {
        const href = m.href ?? MODULE_CHILDREN[m.name]?.[0]?.href;
        if (!href || byHref.has(href)) continue;
        byHref.set(href, {
          label: m.name,
          href,
          icon: m.icon ? MODULE_ICONS[m.icon] : DEFAULT_ICON,
        });
      }
    }
    return [...byHref.values()];
  }, [groups]);

  const userPinnedItems = useMemo(
    () => allModuleItems.filter((i) => isPinned(i.href) && !isHidden(i.href)),
    [allModuleItems, pinned, hidden]
  );
  const hiddenItems = useMemo(
    () => allModuleItems.filter((i) => isHidden(i.href)),
    [allModuleItems, hidden]
  );

  // Collapsed mode: icon-only top-level rows (no expansion, no text).
  const renderCollapsedModule = (m: NavModule) => {
    const target = m.href ?? MODULE_CHILDREN[m.name]?.[0]?.href;
    const Icon = (m.icon && MODULE_ICONS[m.icon]) || DEFAULT_ICON;
    if (!target) return null;
    const active = isActiveHref(pathname, target);
    return (
      <Link
        key={m.moduleId}
        href={target}
        onClick={onNavigate}
        data-tour-module={slugify(m.name)}
        title={m.name}
        className={cn(
          "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors border-l-2",
          active
            ? "bg-secondary/10 text-primary border-l-2 border-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </Link>
    );
  };

  return (
    <div data-tour="sidebar" className="flex flex-col flex-1 min-h-0">
      {/* Sticky top block — Dashboard, search and pinned modules stay fixed
          like the header while the module tree below scrolls. */}
      <div className="shrink-0 p-3 space-y-1">
        {renderPinned(PINNED_TOP)}

        {!collapsed && (
          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nav..."
                aria-label="Search navigation"
                className="w-full rounded-lg border border-border bg-muted/40 pl-8 pr-7 py-1.5 text-xs outline-none focus:border-primary/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {userPinnedItems.length > 0 && (
          <div className={cn(!collapsed && "mt-3 pt-2 border-t border-border/60")}>
            {!collapsed && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 pb-1">
                Pinned
              </div>
            )}
            <div className="space-y-0.5">
              {userPinnedItems.map((i) => {
                const PinnedIcon = i.icon ?? DEFAULT_ICON;
                if (collapsed) {
                  return (
                    <Link
                      key={`pin-${i.href}`}
                      href={i.href}
                      onClick={onNavigate}
                      title={i.label}
                      className={cn(
                        "flex items-center justify-center px-3 py-2.5 rounded-lg transition-colors border-l-2",
                        isActiveHref(pathname, i.href)
                          ? "bg-secondary/10 text-primary border-l-2 border-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent"
                      )}
                    >
                      <PinnedIcon className="h-4 w-4 shrink-0" />
                    </Link>
                  );
                }
                return (
                  <LeafRow
                    key={`pin-${i.href}`}
                    label={i.label}
                    href={i.href}
                    icon={i.icon}
                    isActive={isActiveHref(pathname, i.href)}
                    collapsed={false}
                    depth={0}
                    onNavigate={onNavigate}
                    pinned
                    onPin={() => setPin(i.href, false)}
                    onHide={() => setHide(i.href, true)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable module tree */}
      <nav ref={navRef} className="flex-1 overflow-y-auto min-h-0">
        <div className={cn("space-y-1", collapsed ? "p-3" : "p-3")}>
          {!collapsed && hiddenItems.length > 0 && (
            <div className="mt-1 px-3">
              <button
                type="button"
                onClick={() => setShowHidden((s) => !s)}
                className="flex items-center gap-1.5 w-full py-1 px-2 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                <EyeOff className="h-3 w-3" />
                Hidden modules
                <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-px">
                  {hiddenItems.length}
                </span>
                <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", showHidden && "rotate-180")} />
              </button>
              {showHidden && (
                <div className="space-y-0.5 mt-0.5">
                  {hiddenItems.map((i) => {
                    const HiddenIcon = i.icon ?? DEFAULT_ICON;
                    return (
                      <div
                        key={`hidden-${i.href}`}
                        className="group flex items-center gap-2 rounded-lg pr-1 pl-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
                      >
                        <HiddenIcon className="h-3.5 w-3.5 shrink-0" />
                        <Link href={i.href} onClick={onNavigate} className="min-w-0 flex-1 py-0.5">
                          <span className="truncate">{i.label}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setHide(i.href, false)}
                          title="Restore to nav"
                          className="p-1 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {groups.map((group, gi) => {
            const groupModules = group.modules
              .map((m) => {
                const children = MODULE_CHILDREN[m.name] ?? [];
                const visibleChildren = children.filter((c) => canSee(c.minRole, role));
                const hasSections = m.sections.length > 0;
                const hasChildRows = visibleChildren.length > 0;
                const leafModule = !hasChildRows && !hasSections;
                const moduleHref = m.href ?? MODULE_CHILDREN[m.name]?.[0]?.href;
                if (moduleHref && isHidden(moduleHref)) return null;
                // Pinned modules live only in the sticky Pinned section at the
                // top — they must not also render in their original group.
                if (moduleHref && isPinned(moduleHref)) return null;
                const moduleMatches = searching ? matches(m.name) : true;
                const childMatches = searching ? visibleChildren.some((c) => matches(c.label)) : true;
                if (searching && !moduleMatches && !childMatches) return null;
                if (leafModule && !moduleMatches) return null;
                return { m, children: visibleChildren, hasSections, hasChildRows, leafModule, moduleHref, childMatches };
              })
              .filter((x): x is NonNullable<typeof x> => x != null);
            if (groupModules.length === 0) return null;
            return (
              <div key={gi}>
                {!collapsed && (
                  <div
                    data-tour-group={slugify(group.label)}
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1"
                  >
                    {group.label}
                  </div>
                )}
                {groupModules.map(({ m, children, hasSections, hasChildRows, leafModule, moduleHref, childMatches }) => {
                  if (collapsed) return renderCollapsedModule(m);

                  const isOpen = searching && hasChildRows && childMatches ? true : !!expanded[m.name];
                  const active = !!moduleHref && isActiveHref(pathname, moduleHref);

                  const actions = moduleHref ? (
                    <RowActions
                      pinned={isPinned(moduleHref)}
                      onPin={() => setPin(moduleHref, !isPinned(moduleHref))}
                      onHide={() => setHide(moduleHref, true)}
                    />
                  ) : null;

                  // Module with no children and no sections → leaf link with actions.
                  if (leafModule && moduleHref) {
                    return (
                      <LeafRow
                        key={m.moduleId}
                        label={m.name}
                        href={moduleHref}
                        icon={m.icon ? MODULE_ICONS[m.icon] : DEFAULT_ICON}
                        isActive={active}
                        collapsed={collapsed}
                        depth={0}
                        onNavigate={onNavigate}
                        pinned={isPinned(moduleHref)}
                        onPin={() => setPin(moduleHref, !isPinned(moduleHref))}
                        onHide={() => setHide(moduleHref, true)}
                        tourId={slugify(m.name)}
                      />
                    );
                  }

                  return (
                    <TreeRow
                      key={m.moduleId}
                      label={m.name}
                      icon={m.icon ? MODULE_ICONS[m.icon] : DEFAULT_ICON}
                      href={m.href}
                      isOpen={isOpen}
                      isActive={active}
                      depth={0}
                      onToggle={() => toggle(m.name)}
                      onNavigate={onNavigate}
                      tourId={slugify(m.name)}
                      actions={actions}
                    >
                      {hasChildRows && (
                        <div className="space-y-0.5">
                          {children.map((c) => (
                            <TreeRow
                              key={c.href}
                              label={c.label}
                              href={c.href}
                              isOpen={false}
                              isActive={isActiveHref(pathname, c.href)}
                              depth={1}
                              onToggle={() => toggle(c.href)}
                              onNavigate={onNavigate}
                            />
                          ))}
                        </div>
                      )}
                      {hasSections && renderSections(m.sections, 0, null, m.href ?? "/dashboard")}
                    </TreeRow>
                  );
                })}
              </div>
            );
          })}

          <div data-tour="pinned" className={cn(!collapsed && "mt-3 pt-3 border-t border-border/60")}>
            {renderPinned(PINNED_BOTTOM)}
          </div>
        </div>
      </nav>
    </div>
  );
}
