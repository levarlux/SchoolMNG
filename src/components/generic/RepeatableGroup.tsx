"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { FieldRenderer } from "./FieldRenderer";
import { Plus, Trash2, Copy, GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

interface RepeatableGroupProps {
  sectionId: string;
  sectionName: string;
  recordId: string;
  schoolId: Id<"schools">;
  disabled?: boolean;
  readOnly?: boolean;
}

interface RepeatableEntry {
  id: string; // local temporary ID
  values: Record<string, string>;
  recordId?: string; // server record ID if saved
}

/**
 * Renders a repeatable section (e.g., allergies, medications, growth logs).
 * Each entry is a group of fields that can be added, removed, and duplicated.
 * 
 * Entries are stored as separate records with a parentId linking them to the
 * main record, and field values linked to each entry record.
 */
export function RepeatableGroup({
  sectionId,
  sectionName,
  recordId,
  schoolId,
  disabled = false,
  readOnly = false,
}: RepeatableGroupProps) {
  const fields = useQuery(api.fields.listBySection, { sectionId: sectionId as any });
  const school = useSchool();

  const [entries, setEntries] = useState<RepeatableEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  const sortedFields = useMemo(
    () => (fields ? [...fields].filter((f) => f.isEnabled !== false).sort((a, b) => a.order - b.order) : []),
    [fields]
  );

  if (fields === undefined) {
    return (
      <div className="flex items-center justify-center py-4">
        <BrandLoader variant="dots" size="sm" />
      </div>
    );
  }

  if (sortedFields.length === 0) return null;

  function addEntry() {
    const newEntry: RepeatableEntry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      values: {},
    };
    setEntries((prev) => [...prev, newEntry]);
  }

  function removeEntry(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  function duplicateEntry(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const newEntry: RepeatableEntry = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      values: { ...entry.values },
    };
    setEntries((prev) => [...prev, newEntry]);
  }

  function updateEntryField(entryId: string, fieldId: string, value: string) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, values: { ...e.values, [fieldId]: value } }
          : e
      )
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, index) => (
        <Card key={entry.id} className="border border-border/50 bg-muted/10">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">
                  {sectionName} #{index + 1}
                </CardTitle>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicateEntry(entry.id)}
                    disabled={disabled}
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(entry.id)}
                    disabled={disabled}
                    className="text-destructive hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    value={entry.values[field._id] ?? ""}
                    onChange={
                      readOnly
                        ? undefined
                        : (val) => updateEntryField(entry.id, field._id, val)
                    }
                    options={field.options}
                    isRequired={field.isRequired}
                    isDisabled={disabled}
                    readOnly={readOnly}
                    isSensitive={field.isSensitive}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={addEntry}
          disabled={disabled}
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4 mr-2" /> Add {sectionName}
        </Button>
      )}

      {entries.length === 0 && readOnly && (
        <p className="text-xs text-muted-foreground text-center py-2 italic">
          No entries recorded
        </p>
      )}
    </div>
  );
}
