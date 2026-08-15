"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { BrandLoader } from "@/components/ui/brand-loader";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

type Bucket = "learner" | "teaching_staff" | "non_teaching_staff" | "admin_staff" | "leadership";

type FieldInputType =
  | "text_short"
  | "text_long"
  | "number"
  | "date"
  | "boolean"
  | "dropdown_single"
  | "dropdown_multi"
  | "file";

const BUCKETS: { value: Bucket; label: string }[] = [
  { value: "learner", label: "Learner" },
  { value: "teaching_staff", label: "Teaching Staff" },
  { value: "non_teaching_staff", label: "Non-Teaching Staff" },
  { value: "admin_staff", label: "Admin Staff" },
  { value: "leadership", label: "Leadership" },
];

const INPUT_TYPE_LABELS: Record<FieldInputType, string> = {
  text_short: "Short text",
  text_long: "Long text",
  number: "Number",
  date: "Date",
  boolean: "Yes/No",
  dropdown_single: "Dropdown (single)",
  dropdown_multi: "Dropdown (multiple)",
  file: "File upload",
};

type EditingState =
  | { level: "module"; id?: Id<"modules"> }
  | { level: "section"; id?: Id<"sections">; moduleId: Id<"modules">; parentId?: Id<"sections"> }
  | { level: "field"; id?: Id<"fields">; sectionId: Id<"sections"> };

type SavePayload =
  | { level: "module"; id?: Id<"modules">; bucket: Bucket; name: string; description?: string }
  | {
      level: "section";
      id?: Id<"sections">;
      moduleId?: Id<"modules">;
      parentId?: Id<"sections">;
      name: string;
      description?: string;
      isRepeatable: boolean;
      isSensitive: boolean;
    }
  | {
      level: "field";
      id?: Id<"fields">;
      sectionId: Id<"sections">;
      name: string;
      inputType: FieldInputType;
      options: string[];
      aliases: string[];
      isRequired: boolean;
      isSensitive: boolean;
    };

type DeleteState =
  | { type: "module"; id: Id<"modules">; name: string; sections: number; fields: number }
  | { type: "section"; id: Id<"sections">; name: string; fields: number }
  | { type: "field"; id: Id<"fields">; name: string };

function Toggle({
  checked,
  onChange,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-primary bg-primary" : "border-slate-400 bg-input"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function RowAction({
  title,
  onClick,
  danger,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function SectionNode({
  section,
  depth,
  allSections,
  allFields,
  expandedSections,
  onToggleExpand,
  toggling,
  onToggleSection,
  onToggleField,
  onEditSection,
  onEditField,
  onDeleteSection,
  onDeleteField,
  onAddSubsection,
  onAddField,
}: {
  section: Doc<"sections">;
  depth: number;
  allSections: Doc<"sections">[];
  allFields: Doc<"fields">[];
  expandedSections: Set<string>;
  onToggleExpand: (id: string) => void;
  toggling: string | null;
  onToggleSection: (s: Doc<"sections">) => void;
  onToggleField: (f: Doc<"fields">) => void;
  onEditSection: (s: Doc<"sections">) => void;
  onEditField: (f: Doc<"fields">) => void;
  onDeleteSection: (s: Doc<"sections">) => void;
  onDeleteField: (f: Doc<"fields">) => void;
  onAddSubsection: (s: Doc<"sections">) => void;
  onAddField: (s: Doc<"sections">) => void;
}) {
  const expanded = expandedSections.has(section._id);
  const fieldsInSection = allFields
    .filter((f) => f.sectionId === section._id)
    .sort((a, b) => a.order - b.order);
  const childSections = allSections
    .filter((s) => s.parentId === section._id)
    .sort((a, b) => a.order - b.order);
  const sectionToggling = toggling === `section:${section._id}`;

  return (
    <div className="rounded-lg border border-border">
      <div
        className={`flex items-center gap-2 px-3 py-2 ${section.isEnabled ? "" : "opacity-80"}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <button
          type="button"
          onClick={() => onToggleExpand(section._id)}
          className="p-1 rounded-md hover:bg-muted cursor-pointer"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" className="flex-1 text-left min-w-0" onClick={() => onToggleExpand(section._id)}>
          <span className="text-sm font-medium">{section.name}</span>
          {section.description && (
            <span className="block text-xs text-muted-foreground truncate">{section.description}</span>
          )}
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {section.parentId && (
            <Badge variant="outline" className="flex-shrink-0">
              Sub-section
            </Badge>
          )}
          {section.isRepeatable === true && (
            <Badge variant="default" className="flex-shrink-0">
              Repeatable
            </Badge>
          )}
          {section.isSensitive === true && (
            <Badge variant="warning" className="flex-shrink-0">
              Sensitive
            </Badge>
          )}
          {section.isSystem && (
            <Badge variant="secondary" className="gap-1 flex-shrink-0">
              <Lock className="h-3 w-3" /> System
            </Badge>
          )}
          {!section.isEnabled && (
            <Badge variant="outline" className="flex-shrink-0">
              Disabled
            </Badge>
          )}
        </div>
        <Toggle
          checked={section.isEnabled}
          onChange={() => onToggleSection(section)}
          disabled={sectionToggling}
          title={section.isEnabled ? "Disable section" : "Enable section"}
        />
        <RowAction title="Edit section" onClick={() => onEditSection(section)}>
          <Pencil className="h-4 w-4" />
        </RowAction>
        {!section.isSystem && (
          <RowAction title="Delete section" danger onClick={() => onDeleteSection(section)}>
            <Trash2 className="h-4 w-4" />
          </RowAction>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border pl-6 pr-3 py-2 space-y-2">
          {fieldsInSection.length === 0 && childSections.length === 0 ? (
            <div className="py-3 text-center border border-dashed border-border rounded-lg">
              <p className="text-xs text-muted-foreground">
                No fields yet. Add a field to start collecting data.
              </p>
            </div>
          ) : (
            <>
              {fieldsInSection.map((f) => {
                const fieldEnabled = f.isEnabled !== false;
                const fieldToggling = toggling === `field:${f._id}`;
                return (
                  <div
                    key={f._id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 ${fieldEnabled ? "" : "opacity-80"}`}
                  >
                    <span className="text-xs w-4 text-muted-foreground">•</span>
                    <span className="flex-1 text-left text-sm min-w-0">
                      <span className="font-medium">{f.name}</span>
                      {f.isSensitive === true && (
                        <Badge variant="warning" className="ml-2">
                          Sensitive
                        </Badge>
                      )}
                    </span>
                    <Badge variant="default" className="flex-shrink-0">
                      {INPUT_TYPE_LABELS[f.inputType]}
                    </Badge>
                    {f.isRequired === true && (
                      <Badge variant="outline" className="flex-shrink-0">
                        Required
                      </Badge>
                    )}
                    {f.isSystem === true && (
                      <Badge variant="secondary" className="gap-1 flex-shrink-0">
                        <Lock className="h-3 w-3" /> System
                      </Badge>
                    )}
                    {!fieldEnabled && (
                      <Badge variant="outline" className="flex-shrink-0">
                        Disabled
                      </Badge>
                    )}
                    <Toggle
                      checked={fieldEnabled}
                      onChange={() => onToggleField(f)}
                      disabled={fieldToggling}
                      title={fieldEnabled ? "Disable field" : "Enable field"}
                    />
                    <RowAction title="Edit field" onClick={() => onEditField(f)}>
                      <Pencil className="h-4 w-4" />
                    </RowAction>
                    {f.isSystem !== true && (
                      <RowAction title="Delete field" danger onClick={() => onDeleteField(f)}>
                        <Trash2 className="h-4 w-4" />
                      </RowAction>
                    )}
                  </div>
                );
              })}
              {childSections.map((child) => (
                <SectionNode
                  key={child._id}
                  section={child}
                  depth={depth + 1}
                  allSections={allSections}
                  allFields={allFields}
                  expandedSections={expandedSections}
                  onToggleExpand={onToggleExpand}
                  toggling={toggling}
                  onToggleSection={onToggleSection}
                  onToggleField={onToggleField}
                  onEditSection={onEditSection}
                  onEditField={onEditField}
                  onDeleteSection={onDeleteSection}
                  onDeleteField={onDeleteField}
                  onAddSubsection={onAddSubsection}
                  onAddField={onAddField}
                />
              ))}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => onAddField(section)}
            >
              <Plus className="h-4 w-4" /> Add Field
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => onAddSubsection(section)}
            >
              <Plus className="h-4 w-4" /> Add Sub-section
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface EditorModalProps {
  editing: EditingState;
  bucket: Bucket;
  modules: Doc<"modules">[] | undefined;
  sections: Doc<"sections">[] | undefined;
  fields: Doc<"fields">[] | undefined;
  onClose: () => void;
  onSave: (payload: SavePayload) => void;
  saving: boolean;
}

function EditorModal({ editing, bucket, modules, sections, fields, onClose, onSave, saving }: EditorModalProps) {
  const isCreate = !editing.id;

  const [name, setName] = useState<string>(() => {
    if (editing.level === "module")
      return editing.id ? modules?.find((x) => x._id === editing.id)?.name ?? "" : "";
    if (editing.level === "section")
      return editing.id ? sections?.find((x) => x._id === editing.id)?.name ?? "" : "";
    return editing.id ? fields?.find((x) => x._id === editing.id)?.name ?? "" : "";
  });
  const [description, setDescription] = useState(() => {
    if (editing.level === "section")
      return editing.id ? sections?.find((x) => x._id === editing.id)?.description ?? "" : "";
    return editing.id ? modules?.find((x) => x._id === editing.id)?.description ?? "" : "";
  });
  const [formBucket, setFormBucket] = useState<Bucket>(() => {
    if (editing.level !== "module") return bucket;
    const m = editing.id ? modules?.find((x) => x._id === editing.id) : undefined;
    return m ? (m.bucket as Bucket) : bucket;
  });
  const [isRepeatable, setIsRepeatable] = useState(
    () => editing.level === "section" && (editing.id ? sections?.find((x) => x._id === editing.id)?.isRepeatable === true : false)
  );
  const [isSensitive, setIsSensitive] = useState(() => {
    if (editing.level === "section")
      return editing.id ? sections?.find((x) => x._id === editing.id)?.isSensitive === true : false;
    if (editing.level === "field")
      return editing.id ? fields?.find((x) => x._id === editing.id)?.isSensitive === true : false;
    return false;
  });
  const [inputType, setInputType] = useState<FieldInputType>(() => {
    if (editing.level !== "field") return "text_short";
    return (editing.id ? fields?.find((x) => x._id === editing.id)?.inputType : "text_short") ?? "text_short";
  });
  const [options, setOptions] = useState(() =>
    editing.level === "field" ? (editing.id ? fields?.find((x) => x._id === editing.id)?.options?.join(", ") : "") ?? "" : ""
  );
  const [aliases, setAliases] = useState(() =>
    editing.level === "field" ? (editing.id ? fields?.find((x) => x._id === editing.id)?.aliases?.join(", ") : "") ?? "" : ""
  );
  const [isRequired, setIsRequired] = useState(
    () => editing.level === "field" && (editing.id ? fields?.find((x) => x._id === editing.id)?.isRequired === true : false)
  );
  const [parentId, setParentId] = useState<Id<"sections"> | undefined>(
    () => (editing.level === "section" ? editing.parentId : undefined)
  );

  const title = `${isCreate ? "Create" : "Edit"} ${
    editing.level === "module" ? "Module" : editing.level === "section" ? "Section" : "Field"
  }`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (editing.level === "field" && !inputType) {
      toast.error("Input type is required.");
      return;
    }
    const opts = options.split(",").map((s) => s.trim()).filter(Boolean);
    const ali = aliases.split(",").map((s) => s.trim()).filter(Boolean);
    if (editing.level === "module") {
      onSave({ level: "module", id: editing.id, bucket: formBucket, name, description });
    } else     if (editing.level === "section") {
      onSave({
        level: "section",
        id: editing.id,
        moduleId: editing.moduleId,
        parentId,
        name,
        description,
        isRepeatable,
        isSensitive,
      });
    } else {
      onSave({
        level: "field",
        id: editing.id,
        sectionId: editing.sectionId,
        name,
        inputType,
        options: opts,
        aliases: ali,
        isRequired,
        isSensitive,
      });
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="sb-name">Name</Label>
          <Input
            id="sb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={editing.level === "module" ? "e.g. Health & Wellness" : editing.level === "section" ? "e.g. Personal Details" : "e.g. Blood Group"}
            className="mt-1"
            autoFocus
          />
        </div>

        {editing.level === "module" && (
          <div>
            <Label>Bucket</Label>
            <Select
              value={formBucket}
              onChange={(e) => setFormBucket(e.target.value as Bucket)}
              className="mt-1"
              disabled={!isCreate}
            >
              {BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
            {!isCreate && (
              <p className="text-xs text-muted-foreground mt-1">A module&apos;s bucket can&apos;t be changed after creation.</p>
            )}
          </div>
        )}

        {editing.level !== "field" && (
          <div>
            <Label htmlFor="sb-description">Description</Label>
            <textarea
              id="sb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description shown in the nav / record pages."
              rows={2}
              className="mt-1 flex w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 resize-y"
            />
          </div>
        )}

        {editing.level === "field" && (
          <>
            <div>
              <Label htmlFor="sb-input-type">Input Type</Label>
              <Select
                id="sb-input-type"
                value={inputType}
                onChange={(e) => setInputType(e.target.value as FieldInputType)}
                className="mt-1"
              >
                {Object.entries(INPUT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            {(inputType === "dropdown_single" || inputType === "dropdown_multi") && (
              <div>
                <Label htmlFor="sb-options">Options</Label>
                <Input
                  id="sb-options"
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="e.g. A+, A-, B+, B- (comma-separated)"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Comma-separated list of choices for this dropdown.</p>
              </div>
            )}

            <div>
              <Label htmlFor="sb-aliases">Import Aliases</Label>
              <Input
                id="sb-aliases"
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
                placeholder="e.g. bloodgroup, blood_group (comma-separated)"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Column headers that auto-map to this field during imports.</p>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
              <div className="flex items-center gap-2.5">
                <Toggle checked={isRequired} onChange={setIsRequired} />
                <Label className="text-sm cursor-pointer">Required</Label>
              </div>
              <div className="flex items-center gap-2.5">
                <Toggle checked={isSensitive} onChange={setIsSensitive} />
                <Label className="text-sm cursor-pointer">Sensitive</Label>
              </div>
            </div>
          </>
        )}

        {editing.level === "section" && isCreate && (
          <div>
            <Label htmlFor="sb-parent">Sub-section of</Label>
            <Select
              id="sb-parent"
              value={parentId ?? ""}
              onChange={(e) => setParentId((e.target.value as Id<"sections">) || undefined)}
              className="mt-1"
            >
              <option value="">— Top-level section —</option>
              {(sections ?? [])
                .filter((s) => s.moduleId === editing.moduleId)
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Leave blank for a top-level section, or pick a parent to create a nested sub-section with its own toggle.
            </p>
          </div>
        )}

        {editing.level === "section" && (
          <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
            <div className="flex items-center gap-2.5">
              <Toggle checked={isRepeatable} onChange={setIsRepeatable} />
              <Label className="text-sm cursor-pointer">Repeatable group</Label>
            </div>
            <div className="flex items-center gap-2.5">
              <Toggle checked={isSensitive} onChange={setIsSensitive} />
              <Label className="text-sm cursor-pointer">Sensitive</Label>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <BrandLoader variant="dots" size="sm" /> : null}
            {saving ? "Saving…" : isCreate ? "Create" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({
  deleting,
  onClose,
  onConfirm,
  saving,
}: {
  deleting: DeleteState;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const valid = confirmText.trim() === deleting.name;

  return (
    <Modal open onClose={onClose} title={`Delete ${deleting.type}`}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-red-800">
              Are you sure you want to delete <b>{deleting.name}</b>?
            </p>
            {deleting.type === "module" && (
              <p className="text-red-700">
                This will also permanently delete all {deleting.sections} section{deleting.sections === 1 ? "" : "s"} and{" "}
                {deleting.fields} field{deleting.fields === 1 ? "" : "s"} inside it.
              </p>
            )}
            {deleting.type === "section" && (
              <p className="text-red-700">
                This will also permanently delete all {deleting.fields} field{deleting.fields === 1 ? "" : "s"} inside it.
              </p>
            )}
            <p className="text-red-700">Any data collected against these fields will be removed too. This cannot be undone.</p>
          </div>
        </div>
        <div>
          <Label htmlFor="sb-delete-confirm">
            Type <b>{deleting.name}</b> to confirm
          </Label>
          <Input
            id="sb-delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={deleting.name}
            className="mt-1"
            disabled={saving}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!valid || saving}>
            {saving ? <BrandLoader variant="dots" size="sm" /> : <Trash2 className="h-4 w-4" />}
            {saving ? "Deleting…" : "Yes, Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function StructureBuilder() {
  const school = useSchool();
  const [bucket, setBucket] = useState<Bucket>("learner");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const modules = useQuery(api.modules.listBySchool, school ? { schoolId: school._id, bucket } : "skip");
  const allSections = useQuery(api.sections.listBySchool, school ? { schoolId: school._id } : "skip");
  const allFields = useQuery(api.fields.listBySchool, school ? { schoolId: school._id } : "skip");

  const createModule = useMutation(api.modules.create);
  const updateModule = useMutation(api.modules.update);
  const removeModule = useMutation(api.modules.remove);
  const createSection = useMutation(api.sections.create);
  const updateSection = useMutation(api.sections.update);
  const removeSection = useMutation(api.sections.remove);
  const createField = useMutation(api.fields.create);
  const updateField = useMutation(api.fields.update);
  const removeField = useMutation(api.fields.remove);

  const sortedModules = useMemo(
    () => [...(modules ?? [])].sort((a, b) => a.order - b.order),
    [modules]
  );

  const [autoExpandedBucket, setAutoExpandedBucket] = useState<Bucket | null>(null);
  useEffect(() => {
    if (modules && autoExpandedBucket !== bucket) {
      setAutoExpandedBucket(bucket);
      setExpandedModules(new Set(modules.map((m) => m._id)));
    }
  }, [modules, bucket, autoExpandedBucket]);

  async function toggleModule(m: Doc<"modules">) {
    const key = `module:${m._id}`;
    setToggling(key);
    try {
      await updateModule({ id: m._id, isEnabled: !m.isEnabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle module.");
    } finally {
      setToggling(null);
    }
  }

  async function toggleSection(s: Doc<"sections">) {
    const key = `section:${s._id}`;
    setToggling(key);
    try {
      await updateSection({ id: s._id, isEnabled: !s.isEnabled });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle section.");
    } finally {
      setToggling(null);
    }
  }

  async function toggleField(f: Doc<"fields">) {
    const key = `field:${f._id}`;
    setToggling(key);
    try {
      await updateField({ id: f._id, isEnabled: f.isEnabled === false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle field.");
    } finally {
      setToggling(null);
    }
  }

  async function handleSave(payload: SavePayload) {
    if (!school) return;
    setSaving(true);
    try {
      if (payload.level === "module") {
        if (payload.id) {
          await updateModule({
            id: payload.id,
            name: payload.name.trim(),
            description: payload.description?.trim() || undefined,
          });
        } else {
          const order =
            (modules ?? []).filter((m) => m.bucket === payload.bucket).reduce((max, m) => Math.max(max, m.order), 0) + 1;
          await createModule({
            schoolId: school._id,
            bucket: payload.bucket,
            name: payload.name.trim(),
            description: payload.description?.trim() || undefined,
            order,
          });
        }
        toast.success(payload.id ? "Module updated." : "Module created.");
      } else if (payload.level === "section") {
        if (payload.id) {
          await updateSection({
            id: payload.id,
            name: payload.name.trim(),
            description: payload.description?.trim() || undefined,
            isRepeatable: payload.isRepeatable,
            isSensitive: payload.isSensitive,
          });
        } else if (payload.moduleId) {
          const order =
            (allSections ?? []).filter((s) => s.moduleId === payload.moduleId).reduce((max, s) => Math.max(max, s.order), 0) + 1;
          await createSection({
            schoolId: school._id,
            moduleId: payload.moduleId,
            name: payload.name.trim(),
            description: payload.description?.trim() || undefined,
            order,
            isRepeatable: payload.isRepeatable,
            isSensitive: payload.isSensitive,
            parentId: payload.parentId,
          });
          setExpandedModules((prev) => new Set(prev).add(payload.moduleId!));
          if (payload.parentId) setExpandedSections((prev) => new Set(prev).add(payload.parentId!));
        }
        toast.success(payload.id ? "Section updated." : "Section created.");
      } else {
        if (payload.id) {
          await updateField({
            id: payload.id,
            name: payload.name.trim(),
            inputType: payload.inputType,
            options: payload.options,
            aliases: payload.aliases,
            isRequired: payload.isRequired,
            isSensitive: payload.isSensitive,
          });
        } else {
          const order =
            (allFields ?? []).filter((f) => f.sectionId === payload.sectionId).reduce((max, f) => Math.max(max, f.order), 0) + 1;
          await createField({
            schoolId: school._id,
            sectionId: payload.sectionId,
            name: payload.name.trim(),
            inputType: payload.inputType,
            options: payload.options,
            aliases: payload.aliases,
            isRequired: payload.isRequired,
            isSensitive: payload.isSensitive,
            order,
          });
          setExpandedSections((prev) => new Set(prev).add(payload.sectionId));
          const parentModule = allSections?.find((s) => s._id === payload.sectionId)?.moduleId;
          if (parentModule) setExpandedModules((prev) => new Set(prev).add(parentModule));
        }
        toast.success(payload.id ? "Field updated." : "Field created.");
      }
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      if (deleting.type === "module") await removeModule({ id: deleting.id });
      else if (deleting.type === "section") await removeSection({ id: deleting.id });
      else await removeField({ id: deleting.id });
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setSaving(false);
    }
  }

  function startDeleteModule(m: Doc<"modules">) {
    const sectionCount = (allSections ?? []).filter((s) => s.moduleId === m._id).length;
    const fieldCount = (allSections ?? [])
      .filter((s) => s.moduleId === m._id)
      .reduce((sum, s) => sum + (allFields ?? []).filter((f) => f.sectionId === s._id).length, 0);
    setDeleting({ type: "module", id: m._id, name: m.name, sections: sectionCount, fields: fieldCount });
  }

  function startDeleteSection(s: Doc<"sections">) {
    const fieldCount = (allFields ?? []).filter((f) => f.sectionId === s._id).length;
    setDeleting({ type: "section", id: s._id, name: s.name, fields: fieldCount });
  }

  if (school === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  if (school === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Link this organisation to a school to manage its data structure.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => {
                setBucket(b.value);
                setExpandedModules(new Set());
                setExpandedSections(new Set());
              }}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                bucket === b.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing({ level: "module" })}>
          <Plus className="h-4 w-4" /> Add Module
        </Button>
      </div>

      {modules === undefined || allSections === undefined || allFields === undefined ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <BrandLoader variant="dots" size="sm" /> Loading structure...
        </div>
      ) : sortedModules.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            No modules yet for this bucket. Create your first module to start tracking custom data.
          </p>
          <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setEditing({ level: "module" })}>
            <Plus className="h-4 w-4" /> Add Module
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedModules.map((m) => {
            const expanded = expandedModules.has(m._id);
            const sectionsInModule =
              allSections.filter((s) => s.moduleId === m._id && !s.parentId).sort((a, b) => a.order - b.order) ?? [];
            const moduleToggling = toggling === `module:${m._id}`;
            return (
              <div key={m._id} className="rounded-lg border border-border">
                <div className={`flex items-center gap-2 px-3 py-2.5 ${m.isEnabled ? "" : "opacity-80"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedModules);
                      if (expanded) next.delete(m._id);
                      else next.add(m._id);
                      setExpandedModules(next);
                    }}
                    className="p-1 rounded-md hover:bg-muted cursor-pointer"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => {
                      const next = new Set(expandedModules);
                      if (expanded) next.delete(m._id);
                      else next.add(m._id);
                      setExpandedModules(next);
                    }}
                  >
                    <span className="text-sm font-semibold">{m.name}</span>
                    {m.description && (
                      <span className="block text-xs text-muted-foreground truncate">{m.description}</span>
                    )}
                  </button>
                  {m.isSystem && (
                    <Badge variant="secondary" className="gap-1 flex-shrink-0">
                      <Lock className="h-3 w-3" /> System
                    </Badge>
                  )}
                  {!m.isEnabled && (
                    <Badge variant="outline" className="flex-shrink-0">
                      Disabled
                    </Badge>
                  )}
                  <Toggle
                    checked={m.isEnabled}
                    onChange={() => toggleModule(m)}
                    disabled={moduleToggling}
                    title={m.isEnabled ? "Disable module" : "Enable module"}
                  />
                  <RowAction title="Edit module" onClick={() => setEditing({ level: "module", id: m._id })}>
                    <Pencil className="h-4 w-4" />
                  </RowAction>
                  {!m.isSystem && (
                    <RowAction title="Delete module" danger onClick={() => startDeleteModule(m)}>
                      <Trash2 className="h-4 w-4" />
                    </RowAction>
                  )}
                </div>

                {expanded && (
                  <div className="border-t border-border pl-6 pr-3 py-2 space-y-2">
                    {sectionsInModule.length === 0 ? (
                      <div className="py-3 text-center border border-dashed border-border rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          No sections yet. Add a section to organize fields.
                        </p>
                      </div>
                    ) : (
                      sectionsInModule.map((s) => (
                        <SectionNode
                          key={s._id}
                          section={s}
                          depth={0}
                          allSections={allSections}
                          allFields={allFields}
                          expandedSections={expandedSections}
                          onToggleExpand={(id) => {
                            const next = new Set(expandedSections);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            setExpandedSections(next);
                          }}
                          toggling={toggling}
                          onToggleSection={toggleSection}
                          onToggleField={toggleField}
                          onEditSection={(sec) => setEditing({ level: "section", id: sec._id, moduleId: sec.moduleId })}
                          onEditField={(f) => setEditing({ level: "field", id: f._id, sectionId: f.sectionId })}
                          onDeleteSection={startDeleteSection}
                          onDeleteField={(f) => setDeleting({ type: "field", id: f._id, name: f.name })}
                          onAddSubsection={(sec) => setEditing({ level: "section", moduleId: sec.moduleId, parentId: sec._id })}
                          onAddField={(sec) => setEditing({ level: "field", sectionId: sec._id })}
                        />
                      ))
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => setEditing({ level: "section", moduleId: m._id })}
                    >
                      <Plus className="h-4 w-4" /> Add Section
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditorModal
          key={`${editing.level}:${editing.id ?? "new"}`}
          editing={editing}
          bucket={bucket}
          modules={modules}
          sections={allSections}
          fields={allFields}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {deleting && (
        <DeleteConfirmModal
          key={`${deleting.type}:${deleting.id}`}
          deleting={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          saving={saving}
        />
      )}
    </div>
  );
}
