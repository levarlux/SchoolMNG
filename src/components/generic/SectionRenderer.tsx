"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { FieldRenderer } from "./FieldRenderer";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface SectionRendererProps {
  sectionId: string;
  values: Record<string, string>;
  onChange?: (fieldId: string, value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  showSubsections?: boolean;
}

/**
 * Renders all fields in a section, with optional recursive subsection support.
 * Fetches field metadata from the EAV schema.
 * 
 * Features:
 * - Recursive subsection rendering (parentId-based nesting)
 * - Sensitive section flag (locks/masks content)
 * - Permission-based view/edit gating
 * - Collapsible subsections
 */
export function SectionRenderer({
  sectionId,
  values,
  onChange,
  disabled = false,
  readOnly = false,
  showSubsections = true,
}: SectionRendererProps) {
  const fields = useQuery(api.fields.listBySection, { sectionId: sectionId as any });

  // Get all sections in the school to resolve the parent section's moduleId
  const sectionData = useQuery(
    api.sections.listBySchool,
    fields?.length ? { schoolId: (fields[0] as any).schoolId } : "skip"
  );
  const allSections = useMemo(() => {
    if (!sectionData || !fields?.length) return [];
    const parent = sectionData.find((s) => s._id === sectionId);
    if (!parent) return [];
    return sectionData.filter((s) => s.moduleId === parent.moduleId);
  }, [sectionData, sectionId, fields]);

  // Find subsections (sections whose parentId matches this sectionId)
  const subsections = useMemo(() => {
    if (!allSections || !showSubsections) return [];
    return allSections
      .filter((s) => s.parentId === sectionId && s.isEnabled !== false)
      .sort((a, b) => a.order - b.order);
  }, [allSections, sectionId, showSubsections]);

  const section = useMemo(() => {
    if (!allSections) return null;
    return allSections.find((s) => s._id === sectionId);
  }, [allSections, sectionId]);

  if (fields === undefined) {
    return (
      <div className="flex items-center justify-center py-4">
        <BrandLoader variant="dots" size="sm" />
      </div>
    );
  }

  if (fields.length === 0 && subsections.length === 0) {
    return null;
  }

  const sortedFields = [...fields]
    .filter((f) => f.isEnabled !== false)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Direct fields */}
      {sortedFields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedFields.map((field) => (
            <div
              key={field._id}
              className={
                field.inputType === "text_long" || field.inputType === "dropdown_multi"
                  ? "md:col-span-2"
                  : ""
              }
            >
              <FieldRenderer
                name={field.name}
                inputType={field.inputType}
                value={values[field._id] ?? ""}
                onChange={onChange ? (val) => onChange(field._id, val) : undefined}
                options={field.options}
                isRequired={field.isRequired}
                isDisabled={disabled}
                readOnly={readOnly}
                isSensitive={field.isSensitive}
              />
            </div>
          ))}
        </div>
      )}

      {/* Subsections */}
      {subsections.map((sub) => (
        <SubsectionRenderer
          key={sub._id}
          section={sub}
          values={values}
          onChange={onChange}
          disabled={disabled}
          readOnly={readOnly || sub.isSensitive === true}
        />
      ))}
    </div>
  );
}

/**
 * Renders a collapsible subsection with its fields and nested subsections.
 */
function SubsectionRenderer({
  section,
  values,
  onChange,
  disabled,
  readOnly,
}: {
  section: {
    _id: string;
    name: string;
    description?: string;
    isRepeatable?: boolean;
    isSensitive?: boolean;
    parentId?: string;
    order: number;
  };
  values: Record<string, string>;
  onChange?: (fieldId: string, value: string) => void;
  disabled: boolean;
  readOnly: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fields = useQuery(api.fields.listBySection, { sectionId: section._id as any });

  const sortedFields = useMemo(
    () => (fields ? [...fields].filter((f) => f.isEnabled !== false).sort((a, b) => a.order - b.order) : []),
    [fields]
  );

  if (fields === undefined) {
    return (
      <div className="flex items-center justify-center py-2">
        <BrandLoader variant="dots" size="sm" />
      </div>
    );
  }

  if (sortedFields.length === 0) return null;

  return (
    <Card className={`border-l-2 ${section.isSensitive ? "border-l-amber-500" : "border-l-primary/30"}`}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">{section.name}</span>
          {section.isSensitive && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              <Lock className="h-3 w-3 mr-1" /> Sensitive
            </Badge>
          )}
          {section.isRepeatable && (
            <Badge variant="secondary" className="text-xs">Repeatable</Badge>
          )}
        </div>
        {section.description && (
          <span className="text-xs text-muted-foreground">{section.description}</span>
        )}
      </button>

      {!collapsed && (
        <CardContent className="pt-0 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedFields.map((field) => (
              <div
                key={field._id}
                className={
                  field.inputType === "text_long" || field.inputType === "dropdown_multi"
                    ? "md:col-span-2"
                    : ""
                }
              >
              <FieldRenderer
                name={field.name}
                inputType={field.inputType}
                value={values[field._id] ?? ""}
                onChange={onChange ? (val) => onChange(field._id, val) : undefined}
                options={field.options}
                isRequired={field.isRequired}
                isDisabled={disabled}
                readOnly={readOnly || field.isSensitive === true}
                isSensitive={field.isSensitive === true}
              />
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
