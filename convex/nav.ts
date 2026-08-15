/**
 * Dashboard navigation tree — Phase 17F.2 (slice: hierarchical nav).
 *
 * Builds the sidebar tree from the EAV `modules`/`sections` metadata.
 * A school's enabled modules (as toggled during onboarding via
 * `onboarding.completeOnboarding`) drive what appears, collapsed by default.
 * Each module expands to its sections (and recursive subsections via parentId),
 * so the nav is a true module → section → subsection drill-down rather than a
 * flat hand-coded list.
 *
 * Auth: requireSchoolMembership + the member's role key. Per-node access
 * (resolveEffectiveAccess / scopeRules) is the 17C follow-up slice and is NOT
 * wired here yet — for now visibility = isEnabled (onboarding-driven) plus
 * leadership-only gating for the modules named in ROLE_GATED_MODULES. Once 17C
 * is in, every module/section gets an `access` field and hidden nodes are
 * filtered here (the frontend never decides visibility).
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSchoolMembership, getMemberRole } from "./helpers";
import { LEADERSHIP_ROLE_KEY } from "./roles";
import type { Id } from "./_generated/dataModel";

/** Sidebar grouping per EAV bucket. Keeps the nav organised the way the
 * existing hand-coded nav groups things. */
const BUCKET_GROUP: Record<string, string> = {
  learner: "Learner",
  teaching_staff: "Teaching Staff",
  non_teaching_staff: "Non-Teaching Staff",
  admin_staff: "Admin Staff",
  leadership: "Leadership",
};

/** Modules whose pages are leadership-only in the current role model.
 * Hidden from non-leadership members regardless of enablement. */
const ROLE_GATED_MODULES = new Set<string>([
  "Student Record",
  "Academics",
  "Discipline",
  "Finance",
  "Health/Welfare",
  "Health/Clinic",
  "Transport",
  "Academics & Teaching Load",
  "Duty Roster",
  "Staff Attendance",
  "HR & Performance",
  "Admissions",
  "Correspondence",
  "Appointments",
  "Facilities",
  "Roles & Permissions",
  "Compliance/Policy",
  "Board Reporting",
]);

/** Modules (by name) that already have a backing dashboard page — the module
 * row links there, and sections drill into the same page until their
 * dedicated section pages are built in 17F.2. */
const MODULE_HREF: Record<string, string | null> = {
  "Student Record": "/dashboard/students",
  Academics: "/dashboard/classes",
  Attendance: "/dashboard/attendance",
  Library: "/dashboard/books",
  "Health/Welfare": "/dashboard/health",
  "Health/Clinic": "/dashboard/medical",
  Discipline: "/dashboard/discipline",
  Finance: "/dashboard/fees",
  "Promotion/Progression": "/dashboard/students",
  Documents: "/dashboard/students",
  Communication: "/dashboard/announcements",
  Extracurricular: "/dashboard/extracurricular",
  Boarding: "/dashboard/students",
  Transport: "/dashboard/transport",
  Feeding: "/dashboard/students",
  "Gate/Security": "/dashboard/gate-log",
  Facilities: "/dashboard/maintenance",
  "Staff Record": "/dashboard/teachers",
  "Academics & Teaching Load": "/dashboard/lesson-planning",
  "Duty Roster": "/dashboard/duty-roster",
  "Staff Attendance": "/dashboard/staff-attendance",
  "HR & Performance": "/dashboard/hr",
  Payroll: "/dashboard/payroll",
  "Parent Meetings": "/dashboard/parent-meetings",
  Admissions: "/dashboard/admissions",
  Correspondence: "/dashboard/correspondence",
  Appointments: "/dashboard/appointments",
  "Roles & Permissions": "/dashboard/permissions",
  "Compliance/Policy": "/dashboard/compliance",
  "Board Reporting": "/dashboard/board-meetings",
  Broadcasts: "/dashboard/announcements",
};

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
  icon: string | undefined;
  href: string | null;
  sections: SectionNode[];
}

export const getNavTree = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }): Promise<{
    role: string | null;
    groups: Array<{ label: string; modules: NavModule[] }>;
  }> => {
    await requireSchoolMembership(ctx, schoolId);
    const role = await getMemberRole(ctx, schoolId);
    const isLeadership = role === LEADERSHIP_ROLE_KEY;

    // Single batched read: all modules + all sections for the school, then
    // build the parent/child trees in memory (avoids N+1 queries per module).
    const [modules, sections] = await Promise.all([
      ctx.db
        .query("modules")
        .withIndex("by_schoolId_bucket", (q) => q.eq("schoolId", schoolId))
        .order("asc")
        .take(100),
      ctx.db
        .query("sections")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(500),
    ]);

    // Index sections by moduleId → parentId → children, skipping disabled ones.
    const sectionsByModule = new Map<Id<"modules">, Map<string | null, SectionNode[]>>();
    for (const s of sections) {
      if (!s.isEnabled) continue;
      const byParent = sectionsByModule.get(s.moduleId) ?? new Map<string | null, SectionNode[]>();
      const node: SectionNode = {
        sectionId: s._id,
        name: s.name,
        parentId: s.parentId ?? null,
        order: s.order,
        isEnabled: s.isEnabled,
        isRepeatable: !!s.isRepeatable,
        isSensitive: !!s.isSensitive,
        subsections: [],
      };
      const key = s.parentId ?? null;
      const bucket = byParent.get(key) ?? [];
      bucket.push(node);
      byParent.set(key, bucket);
      sectionsByModule.set(s.moduleId, byParent);
    }

    const buildTree = (
      byParent: Map<string | null, SectionNode[]>,
      parentId: string | null,
    ): SectionNode[] => {
      const children = (byParent.get(parentId) ?? [])
        .sort((a, b) => a.order - b.order);
      for (const child of children) {
        child.subsections = buildTree(byParent, child.sectionId);
      }
      return children;
    };

    const groups: Record<string, NavModule[]> = {};
    for (const mod of modules) {
      if (!mod.isEnabled) continue;
      // Leadership-gated modules are hidden for non-leadership roles.
      if (ROLE_GATED_MODULES.has(mod.name) && !isLeadership) continue;

      const byParent = sectionsByModule.get(mod._id) ?? new Map();
      const entry: NavModule = {
        moduleId: mod._id,
        name: mod.name,
        icon: mod.icon,
        // Every module must land somewhere clickable: a dedicated dashboard
        // page when one exists, otherwise the generic EAV records page for
        // this module. No dead rows / arrow-cursor items.
        href: MODULE_HREF[mod.name] ?? `/dashboard/records?moduleId=${mod._id}`,
        sections: buildTree(byParent, null),
      };
      const groupLabel = BUCKET_GROUP[mod.bucket] ?? "Modules";
      if (!groups[groupLabel]) groups[groupLabel] = [];
      groups[groupLabel].push(entry);
    }

    return {
      role: role ?? null,
      groups: Object.entries(groups).map(([label, mods]) => ({ label, modules: mods })),
    };
  },
});
