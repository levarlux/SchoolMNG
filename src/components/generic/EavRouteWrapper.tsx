"use client";

/**
 * EavRouteWrapper — A route-level wrapper that checks if the current
 * module has EAV sections configured and renders accordingly.
 *
 * Usage in a page:
 *   import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";
 *   import { HardcodedPage } from "./HardcodedPage";
 *
 *   export default function Page() {
 *     return <EavRouteWrapper moduleName="Attendance"><HardcodedPage /></EavRouteWrapper>;
 *   }
 *
 * But actually — the BETTER approach is to not modify pages at all.
 * The nav.ts change already handles routing. This component is for
 * pages that want explicit EAV/fallback control within the same page.
 */

import React from "react";
import { useEavModule } from "@/lib/use-eav-module";
import { ModuleRenderer } from "./ModuleRenderer";
import { RecordList } from "./RecordList";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import Link from "next/link";

interface EavRouteWrapperProps {
  moduleName: string;
  children: React.ReactNode;
  bucket?: string;
}

export function EavRouteWrapper({
  moduleName,
  children,
  bucket = "learner",
}: EavRouteWrapperProps) {
  const { sections, hasEavStructure, isLoading, moduleId } =
    useEavModule(moduleName);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="dots" />
      </div>
    );
  }

  if (hasEavStructure) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{moduleName}</h1>
            <p className="text-sm text-muted-foreground">
              {sections.length} section{sections.length !== 1 ? "s" : ""} · EAV mode
            </p>
          </div>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" /> Structure
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

  return <>{children}</>;
}
