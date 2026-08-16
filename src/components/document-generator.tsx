"use client";

/**
 * Document Generator — UI for template-based PDF generation.
 *
 * Schools select a template, choose a student, and generate a PDF.
 * Also provides access to template management.
 */

import React, { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  FileText,
  Download,
  Copy,
  Trash2,
  Printer,
  Layout,
  CreditCard,
  Users,
  Award,
  File,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select } from "./ui/select";
import { Modal } from "./ui/modal";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { BrandLoader } from "./ui/brand-loader";
import { toast } from "sonner";

const DOC_TYPE_ICONS: Record<string, React.ReactNode> = {
  report_card: <FileText className="h-5 w-5" />,
  receipt: <CreditCard className="h-5 w-5" />,
  class_list: <Users className="h-5 w-5" />,
  certificate: <Award className="h-5 w-5" />,
  general: <File className="h-5 w-5" />,
};

const DOC_TYPE_LABELS: Record<string, string> = {
  report_card: "Report Card",
  receipt: "Fee Receipt",
  class_list: "Class List",
  certificate: "Certificate",
  general: "General Document",
};

interface DocumentGeneratorProps {
  schoolId: Id<"schools">;
}

export function DocumentGenerator({ schoolId }: DocumentGeneratorProps) {
  const templates = useQuery(api.docTemplates.list, { schoolId });
  const students = useQuery(api.students.listBySchool, { schoolId });
  const ensureTemplates = useMutation(api.templateSeed.ensureTemplates);
  const deleteTemplate = useMutation(api.docTemplates.remove);
  const duplicateTemplate = useMutation(api.docTemplates.duplicate);

  const [selectedDocType, setSelectedDocType] = useState<string>("report_card");
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id<"doc_templates"> | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<Id<"students"> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateSourceId, setDuplicateSourceId] = useState<Id<"doc_templates"> | null>(null);

  // Ensure templates exist on first load
  React.useEffect(() => {
    if (schoolId) {
      ensureTemplates({ schoolId }).catch(console.error);
    }
  }, [schoolId, ensureTemplates]);

  const filteredTemplates = templates?.filter((t) => t.docType === selectedDocType) ?? [];

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplateId) {
      toast.error("Please select a template");
      return;
    }
    if (selectedDocType !== "class_list" && !selectedStudentId) {
      toast.error("Please select a student");
      return;
    }

    setGenerating(true);
    try {
      // Use Convex HTTP action or action to generate
      toast.info("Document generation requires the Convex client. Use the Generate button on the student profile page.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate document");
    } finally {
      setGenerating(false);
    }
  }, [selectedTemplateId, selectedStudentId, selectedDocType]);

  const handleDuplicate = useCallback(async () => {
    if (!duplicateSourceId || !duplicateName.trim()) return;
    try {
      await duplicateTemplate({ templateId: duplicateSourceId, name: duplicateName.trim() });
      toast.success("Template duplicated");
      setDuplicateDialogOpen(false);
      setDuplicateName("");
      setDuplicateSourceId(null);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to duplicate template");
    }
  }, [duplicateSourceId, duplicateName, duplicateTemplate]);

  const handleDelete = useCallback(async (templateId: Id<"doc_templates">) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try {
      await deleteTemplate({ templateId });
      toast.success("Template deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete template");
    }
  }, [deleteTemplate]);

  if (templates === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="dots" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Doc Type Tabs (simple button group) */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setSelectedDocType(key);
              setSelectedTemplateId(null);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              selectedDocType === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {DOC_TYPE_ICONS[key]}
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layout className="h-4 w-4" /> Templates
            </CardTitle>
            <CardDescription>
              {DOC_TYPE_LABELS[selectedDocType]} templates for this school
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No templates found. Default templates will be seeded automatically.
              </p>
            ) : (
              filteredTemplates.map((tmpl) => (
                <div
                  key={tmpl._id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTemplateId === tmpl._id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedTemplateId(tmpl._id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {DOC_TYPE_ICONS[tmpl.docType]}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tmpl.name}</p>
                      {tmpl.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {tmpl.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {tmpl.isDefault && (
                      <Badge variant="secondary" className="text-[9px]">Default</Badge>
                    )}
                    {tmpl.isSystem && (
                      <Badge variant="outline" className="text-[9px]">System</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDuplicateSourceId(tmpl._id);
                        setDuplicateName(`${tmpl.name} (Copy)`);
                        setDuplicateDialogOpen(true);
                      }}
                      title="Duplicate"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {!tmpl.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(tmpl._id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Generation Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Printer className="h-4 w-4" /> Generate Document
            </CardTitle>
            <CardDescription>
              Select a student and generate a PDF from the selected template
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Student selector (not for class_list) */}
            {selectedDocType !== "class_list" && (
              <div className="space-y-2">
                <Label>Student</Label>
                <Select
                  value={selectedStudentId ?? ""}
                  onChange={(e) => setSelectedStudentId(e.target.value as Id<"students">)}
                >
                  <option value="">Select a student...</option>
                  {students?.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.firstName} {s.lastName} ({s.admNo})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={!selectedTemplateId || generating || (selectedDocType !== "class_list" && !selectedStudentId)}
              className="w-full"
            >
              {generating ? (
                <>
                  <BrandLoader variant="dots" size="sm" className="mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate PDF
                </>
              )}
            </Button>

            {/* Template info */}
            {selectedTemplateId && (
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p>
                  <strong>Selected template:</strong>{" "}
                  {filteredTemplates.find((t) => t._id === selectedTemplateId)?.name}
                </p>
                <p>
                  <strong>Sections:</strong>{" "}
                  {filteredTemplates.find((t) => t._id === selectedTemplateId)?.layout?.sections?.length ?? 0}
                </p>
                <p>
                  <strong>Page size:</strong>{" "}
                  {filteredTemplates.find((t) => t._id === selectedTemplateId)?.pageSize ?? "letter"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Modal */}
      <Modal
        open={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        title="Duplicate Template"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a copy of this template with a new name. You can then customize the layout.
          </p>
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Enter a name for the copy..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              Duplicate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
