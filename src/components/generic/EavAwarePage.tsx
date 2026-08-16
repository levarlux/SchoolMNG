"use client";

/**
 * EavAwarePage — A wrapper that conditionally renders either:
 * (a) The generic EAV module view (ModuleRenderer + RecordList) when the
 *     module has EAV sections/fields configured, or
 * (b) The hardcoded page (children) when no EAV structure exists.
 *
 * This is the core migration pattern: existing hardcoded pages wrap their
 * content in <EavAwarePage moduleName="Attendance"> and get automatic
 * EAV migration when the school builds structure in Settings → Data Structure.
 */

import React from "react";
import { useEavModule } from "@/lib/use-eav-module";
import { ModuleRenderer } from "./ModuleRenderer";
import { RecordList } from "./RecordList";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, ArrowRight } from "lucide-react";
import Link from "next/link";

interface EavAwarePageProps {
  /** Module name as it appears in the modules table (e.g. "Attendance", "Finance") */
  moduleName: string;
  /** The hardcoded page content to render when no EAV structure exists */
  children: React.ReactNode;
  /** Optional: force EAV mode even if no sections exist (for testing) */
  forceEav?: boolean;
  /** Optional: bucket type for EAV rendering */
  bucket?: string;
}

export function EavAwarePage({
  moduleName,
  children,
  forceEav = false,
  bucket = "learner",
}: EavAwarePageProps) {
  const { module, sections, hasEavStructure, isLoading, moduleId } =
    useEavModule(moduleName);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="dots" />
      </div>
    );
  }

  // EAV mode: module has sections configured → render via generic components
  if (hasEavStructure || forceEav) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{moduleName}</h1>
            <p className="text-sm text-muted-foreground">
              {sections.length} section{sections.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" /> Manage Structure
            </Button>
          </Link>
        </div>

        <RecordList bucket={bucket as any} />

        {moduleId && (
          <Card>
            <CardContent className="p-4">
              <ModuleRenderer moduleId={moduleId} bucket={bucket} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Fallback: no EAV structure → render the hardcoded page
  return <>{children}</>;
}
