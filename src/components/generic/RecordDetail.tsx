"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionRenderer } from "./SectionRenderer";
import { Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface RecordDetailProps {
  recordId: string;
  onBack?: () => void;
}

/**
 * Full record detail view — shows all field values and allows editing.
 */
export function RecordDetail({ recordId, onBack }: RecordDetailProps) {
  const record = useQuery(api.records.get, { id: recordId as any });
  const fieldValues = useQuery(api.fieldValues.getValuesForRecord, { recordId: recordId as any });
  const sections = useQuery(api.sections.listBySchool, record ? { schoolId: record.schoolId } : "skip");

  const updateRecord = useMutation(api.records.update);
  const setValue = useMutation(api.fieldValues.setValue);

  const [displayName, setDisplayName] = useState("");
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setDisplayName(record.displayName);
    }
  }, [record]);

  useEffect(() => {
    if (fieldValues) {
      const map: Record<string, string> = {};
      for (const fv of fieldValues) {
        map[fv.fieldId] = fv.value;
      }
      setLocalValues(map);
    }
  }, [fieldValues]);

  if (record === undefined || fieldValues === undefined || sections === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Record not found
      </div>
    );
  }

  // Group sections by module
  const moduleMap = new Map<string, { name: string; sections: typeof sections }>();
  for (const section of sections) {
    const moduleId = section.moduleId;
    if (!moduleMap.has(moduleId)) {
      moduleMap.set(moduleId, { name: "Module", sections: [] });
    }
    moduleMap.get(moduleId)!.sections.push(section);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateRecord({ id: recordId as any, displayName });
      const schoolId = record?.schoolId;
      if (!schoolId) return;
      for (const [fieldId, value] of Object.entries(localValues)) {
        await setValue({
          schoolId,
          recordId: recordId as any,
          fieldId: fieldId as any,
          value,
        });
      }
      toast.success("Record updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          <div>
            <h2 className="text-xl font-bold">{record.displayName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default">{record.bucket}</Badge>
              {record.status && (
                <Badge variant={record.status === "active" ? "success" : "default"}>
                  {record.status}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>

      {/* Display Name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-w-md">
            <label className="text-sm font-medium">Display Name</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Field Value Sections */}
      {Array.from(moduleMap.entries()).map(([moduleId, { sections: moduleSections }]) => (
        <div key={moduleId} className="space-y-4">
          {moduleSections
            .sort((a, b) => a.order - b.order)
            .filter((s) => s.isEnabled)
            .map((section) => (
              <Card key={section._id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{section.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <SectionRenderer
                    sectionId={section._id}
                    values={localValues}
                    onChange={(fieldId, value) =>
                      setLocalValues((prev) => ({ ...prev, [fieldId]: value }))
                    }
                  />
                </CardContent>
              </Card>
            ))}
        </div>
      ))}
    </div>
  );
}
