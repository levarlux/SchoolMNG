"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { Shield, Building2, User, Trash2 } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  "school.create": "School Created",
  "school.update": "School Updated",
  "school.delete": "School Deleted",
  "tier.override": "Tier Override",
  "tier.override_cleared": "Tier Override Cleared",
  "admin.create": "Admin Added",
  "admin.remove": "Admin Removed",
};

const ACTION_ICONS: Record<string, string> = {
  "school.create": "🏫",
  "school.update": "✏️",
  "school.delete": "🗑️",
  "tier.override": "🔄",
  "tier.override_cleared": "↩️",
  "admin.create": "👤",
  "admin.remove": "🚫",
};

export function AdminAuditNotifier() {
  // Track the timestamp of the last entry we've seen
  const lastSeenRef = useRef<number>(Date.now());

  // Subscribe to recent entries since we last checked
  const recentEntries = useQuery(api.platformAudit.getRecentEntries, {
    since: lastSeenRef.current,
    limit: 5,
  });

  useEffect(() => {
    if (!recentEntries || recentEntries.length === 0) return;

    // Filter to entries we haven't seen yet
    const newEntries = recentEntries.filter(
      (e) => e.timestamp > lastSeenRef.current
    );

    if (newEntries.length > 0) {
      // Show toast for each new entry (skip the most recent if it's just us)
      for (const entry of newEntries.slice(0, 3)) {
        const icon = ACTION_ICONS[entry.action] ?? "📋";
        const label = ACTION_LABELS[entry.action] ?? entry.action;
        const school = entry.targetSchoolName ? ` on ${entry.targetSchoolName}` : "";

        toast.info(`${icon} ${label}${school}`, {
          description: entry.adminEmail
            ? `by ${entry.adminEmail}`
            : undefined,
          duration: 5000,
        });
      }

      // Update the last seen timestamp
      lastSeenRef.current = Math.max(
        ...newEntries.map((e) => e.timestamp)
      );
    }
  }, [recentEntries]);

  // This component doesn't render anything visible
  return null;
}
