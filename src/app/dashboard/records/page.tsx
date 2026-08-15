"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { ModuleRenderer } from "@/components/generic/ModuleRenderer";
import { RecordList } from "@/components/generic/RecordList";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, UserPlus, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type BucketType = "learner" | "teaching_staff" | "non_teaching_staff" | "admin_staff" | "leadership";

const BUCKET_HINT: Record<string, string> = {
  learner: "Learner",
  teaching_staff: "Teaching Staff",
  non_teaching_staff: "Non-Teaching Staff",
  admin_staff: "Admin Staff",
  leadership: "Leadership",
};

export default function RecordsPage() {
  const searchParams = useSearchParams();
  const school = useSchool();

  const moduleId = searchParams?.get("moduleId") ?? undefined;
  const initialSection = searchParams?.get("section") ?? undefined;

  const modules = useQuery(
    api.modules.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const [selectedRecordId, setSelectedRecordId] = useState<string | undefined>();

  const module = useMemo(
    () => modules?.find((m) => m._id === moduleId),
    [modules, moduleId]
  );

  if (!moduleId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Records</h1>
          <p className="text-sm text-muted-foreground">Select a module from the sidebar to manage its records.</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <p>Navigate to a module from the sidebar to view and manage its records.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const bucket = (module.bucket as BucketType) ?? "learner";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">{module.name}</h1>
            <Badge variant="secondary">{BUCKET_HINT[bucket] ?? module.bucket}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {module.description ?? "Manage records for this module."}
          </p>
        </div>
        {selectedRecordId && (
          <Button variant="outline" size="sm" onClick={() => setSelectedRecordId(undefined)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to records
          </Button>
        )}
      </div>

      {/* Records for this module's bucket */}
      {!selectedRecordId && (
        <RecordList
          bucket={bucket}
          onSelect={setSelectedRecordId}
        />
      )}

      {/* Record detail / module form */}
      {selectedRecordId ? (
        <ModuleRenderer
          moduleId={moduleId}
          recordId={selectedRecordId}
          bucket={bucket}
          initialSectionId={initialSection}
        />
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <p className="max-w-md mx-auto">
              Select a record above to view or edit it, or use <strong>Add</strong> to create a new
              {bucket === "learner" ? " learner" : " record"} for <strong>{module.name}</strong>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
