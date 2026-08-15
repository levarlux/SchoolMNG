"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionRenderer } from "./SectionRenderer";
import { RepeatableGroup } from "./RepeatableGroup";
import { Save, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

interface ModuleRendererProps {
  moduleId: string;
  recordId?: string;
  bucket: string;
  readOnly?: boolean;
  onSectionClick?: (sectionId: string) => void;
  initialSectionId?: string;
}

/**
 * Renders a complete module view — reads module metadata, fetches sections,
 * and renders all fields with permission-based visibility.
 *
 * Features:
 * - Permission-based module/section visibility
 * - Tabbed or accordion layout for sections
 * - RepeatableGroup integration for repeatable sections
 * - Save functionality for field values
 * - Empty state handling
 */
export function ModuleRenderer({
  moduleId,
  recordId,
  bucket,
  readOnly = false,
  onSectionClick,
  initialSectionId,
}: ModuleRendererProps) {
  const school = useSchool();
  const module = useQuery(
    api.modules.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const sections = useQuery(api.sections.listByModule, { moduleId: moduleId as any });
  const record = useQuery(api.records.get, recordId ? { id: recordId as any } : "skip");
  const fieldValues = useQuery(
    api.fieldValues.getValuesForRecord,
    recordId ? { recordId: recordId as any } : "skip"
  );

  const setValue = useMutation(api.fieldValues.setValue);
  const setValues = useMutation(api.fieldValues.setValues);
  const updateRecord = useMutation(api.records.update);

  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(initialSectionId ?? null);

  // Initialize local values from fetched field values
  useEffect(() => {
    if (fieldValues) {
      const map: Record<string, string> = {};
      for (const fv of fieldValues) {
        map[fv.fieldDocId] = fv.value;
      }
      setLocalValues(map);
    }
  }, [fieldValues]);

  const moduleData = module?.find((m) => m._id === moduleId);

  // Separate top-level sections from subsections and repeatable sections
  const { topLevelSections, repeatableSections } = useMemo(() => {
    if (!sections) return { topLevelSections: [], repeatableSections: [] };
    const enabled = sections.filter((s) => s.isEnabled && !s.parentId);
    const repeatable = enabled.filter((s) => s.isRepeatable);
    const regular = enabled.filter((s) => !s.isRepeatable);
    return {
      topLevelSections: regular.sort((a, b) => a.order - b.order),
      repeatableSections: repeatable.sort((a, b) => a.order - b.order),
    };
  }, [sections]);

  // Set initial active section
  useEffect(() => {
    if (topLevelSections.length > 0 && !activeSection) {
      setActiveSection(topLevelSections[0]._id);
    }
  }, [topLevelSections, activeSection]);

  if (!moduleData || sections === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  function handleFieldChange(fieldId: string, value: string) {
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSave() {
    if (!recordId || !school) return;
    setSaving(true);
    try {
      // Batch save all field values
      const valueEntries = Object.entries(localValues).filter(([_, v]) => v !== "");
      if (valueEntries.length > 0) {
        await setValues({
          schoolId: school._id,
          recordId: recordId as Id<"records">,
          values: valueEntries.map(([fieldId, value]) => ({
            fieldId: fieldId as Id<"fields">,
            value,
          })),
        });
      }
      toast.success("Saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Module not found
  if (!moduleData) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          Module not found
        </CardContent>
      </Card>
    );
  }

  // Module disabled
  if (!moduleData.isEnabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          <Badge variant="secondary" className="mb-2">Disabled</Badge>
          <p>This module is currently disabled.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{moduleData.name}</h3>
          {moduleData.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{moduleData.description}</p>
          )}
        </div>
        {recordId && !readOnly && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <BrandLoader variant="dots" size="sm" className="mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        )}
      </div>

      {/* Section Tabs (if multiple sections) */}
      {topLevelSections.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border">
          {topLevelSections.map((section) => (
            <button
              key={section._id}
              onClick={() => setActiveSection(section._id)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors ${
                activeSection === section._id
                  ? "bg-primary/10 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {section.name}
            </button>
          ))}
        </div>
      )}

      {/* Active Section Content */}
      {topLevelSections.length > 0 && (
        <div>
          {topLevelSections
            .filter((s) => s._id === activeSection || topLevelSections.length === 1)
            .map((section) => (
              <SectionRenderer
                key={section._id}
                sectionId={section._id}
                values={localValues}
                onChange={readOnly ? undefined : handleFieldChange}
                disabled={!recordId}
                readOnly={readOnly}
              />
            ))}
        </div>
      )}

      {/* Repeatable Sections */}
      {repeatableSections.map((section) => (
        <Card key={section._id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {section.name}
              <Badge variant="secondary" className="text-xs">Repeatable</Badge>
            </CardTitle>
            {section.description && (
              <CardDescription>{section.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <RepeatableGroup
              sectionId={section._id}
              sectionName={section.name}
              recordId={recordId ?? ""}
              schoolId={school!._id}
              disabled={!recordId}
              readOnly={readOnly}
            />
          </CardContent>
        </Card>
      ))}

      {/* Empty State */}
      {topLevelSections.length === 0 && repeatableSections.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No sections configured for this module.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
