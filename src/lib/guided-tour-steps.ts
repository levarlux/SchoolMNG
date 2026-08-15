import {
  Sparkles, LayoutDashboard, Shield, GraduationCap, Map,
  type LucideIcon,
} from "lucide-react";
import type { TourStep } from "@/components/guided-tour";
import { MODULE_CHILDREN, slugify } from "@/components/dashboard-nav";

/** Shape returned by `nav.getNavTree` (what the sidebar renders). */
export type NavGroup = {
  label: string;
  modules: {
    moduleId: string;
    name: string;
    icon?: string;
    href: string | null;
    sections: { name: string; sectionId: string }[];
  }[];
};

const BUCKET_ICONS: Record<string, LucideIcon> = {
  learners: GraduationCap,
  "teaching-staff": Shield,
  "non-teaching-staff": Shield,
  "admin-staff": Shield,
  leadership: Shield,
};

/**
 * Part 1 — workspace showcase: a welcome step, one step per sidebar group,
 * the pinned section, and a hand-off to Part 2.
 */
export function buildPart1Steps(schoolName: string, groups: NavGroup[]): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: `Welcome to ${schoolName}`,
      body: "This is your command center. We'll keep this short: Part 1 shows you the layout, Part 2 walks you through every module you enabled.",
      target: "[data-tour='sidebar']",
      placement: "right",
      icon: Sparkles,
    },
  ];

  for (const group of groups) {
    if (group.modules.length === 0) continue;
    steps.push({
      id: `group-${slugify(group.label)}`,
      title: `${group.label} modules`,
      body: `${group.modules.map((m) => m.name).join(", ")} — click a module to open its submodules and data sections.`,
      target: `[data-tour-group="${slugify(group.label)}"]`,
      placement: "right",
      icon: BUCKET_ICONS[slugify(group.label)] ?? LayoutDashboard,
    });
  }

  steps.push({
    id: "pinned",
    title: "Always within reach",
    body: "Reports, the AI Assistant, Bulk Operations, Permissions, Members, Billing and Settings stay pinned here, no matter which module you're in.",
    target: "[data-tour='pinned']",
    placement: "right",
    icon: Shield,
  });

  steps.push({
    id: "part2-handoff",
    title: "That's the layout",
    body: "Ready to go deeper? Part 2 walks through every module one by one. You can end the tour anytime with the X.",
    icon: Map,
  });

  return steps;
}

/**
 * Part 2 — per-module feature walkthrough. One step per enabled module,
 * spotlighting its sidebar row and listing what it covers.
 */
export function buildPart2Steps(groups: NavGroup[]): TourStep[] {
  const steps: TourStep[] = [];
  for (const group of groups) {
    for (const m of group.modules) {
      const children = MODULE_CHILDREN[m.name] ?? [];
      const features = [
        ...children.map((c) => c.label),
        ...m.sections.map((s) => s.name),
      ];
      const rawBody =
        features.length > 0
          ? features.slice(0, 8).join(" · ")
          : "Configure and manage this module right from the dashboard.";
      const body = rawBody.length > 140 ? `${rawBody.slice(0, 137).trimEnd()}…` : rawBody;
      steps.push({
        id: `module-${slugify(group.label)}-${slugify(m.name)}`,
        title: m.name,
        body,
        target: `[data-tour-module="${slugify(m.name)}"]`,
        placement: "right",
        icon: BUCKET_ICONS[slugify(group.label)] ?? GraduationCap,
      });
    }
  }
  steps.push({
    id: "part2-done",
    title: "You're all set",
    body: "You've seen every module. The X here (and in Settings) can restart this tour whenever you like.",
    icon: Sparkles,
  });
  return steps;
}
