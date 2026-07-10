"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Building2, Search, Globe, Plus, Loader2,
  MoreHorizontal, Pencil, Trash2,
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import type { Doc } from "@/convex/_generated/dataModel";
import { getBaseDomain } from "@/lib/app-domain";

interface ParsedBookRow {
  title: string;
  author: string;
  availableCopies: number;
  totalCopies?: number;
  isbn?: string;
  subject?: string;
}

export default function AdminSchoolsPage() {
  const schools = useQuery(api.schools.list);
  const adminCreate = useAction(api.admin.create);
  const adminUpdate = useAction(api.admin.update);
  const adminRemove = useAction(api.admin.remove);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Step state for the wizard
  const [step, setStep] = useState<1 | 2>(1);

  // Create form states
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // CSV upload state
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [parsedBooks, setParsedBooks] = useState<ParsedBookRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<Doc<"schools"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editClerkOrgId, setEditClerkOrgId] = useState("");
  const [saving, setSaving] = useState(false);

  // Dropdown state — which school's menu is open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filtered = schools?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.slug.toLowerCase().includes(q) ||
      s.clerkOrgId.toLowerCase().includes(q)
    );
  });

  // ── Create ───────────────────────────────────────────

  async function handleCreate() {
    if (!name || !slug) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const result = await adminCreate({
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        books: parsedBooks.length > 0 ? parsedBooks : undefined,
      });
      const bookMsg = result.bookCount > 0
        ? ` and imported ${result.bookCount} book${result.bookCount !== 1 ? "s" : ""}`
        : "";
      toast.success(`School created${bookMsg}! Clerk Org: ${result.clerkOrgId}`);
      resetCreateForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to create school: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function resetCreateForm() {
    setOpen(false);
    setStep(1);
    setName("");
    setSlug("");
    setCsvFileName(null);
    setParsedBooks([]);
    setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Handle name change and auto-suggest a slug
  const handleNameChange = (val: string) => {
    setName(val);
    const suggestedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    setSlug(suggestedSlug);
  };

  // ── CSV Parsing ──────────────────────────────────────

  const EXPECTED_HEADERS = ["title", "author", "availableCopies"];

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setCsvError("Please upload a valid .csv file.");
      return;
    }

    setCsvFileName(file.name);
    setCsvError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // Validate headers
        const headers = results.meta.fields?.map((f) => f.trim()) ?? [];
        const missing = EXPECTED_HEADERS.filter(
          (h) => !headers.some((actual) => actual.toLowerCase() === h.toLowerCase())
        );

        if (missing.length > 0) {
          setCsvError(
            `Missing required columns: ${missing.join(", ")}. Download the template to see the expected format.`
          );
          setParsedBooks([]);
          return;
        }

        if (results.errors.length > 0) {
          setCsvError(`Parsing error: ${results.errors[0].message}`);
          setParsedBooks([]);
          return;
        }

        const books: ParsedBookRow[] = (results.data as Record<string, string>[]).map((row) => {
          const rawAvailable = parseInt(row.availableCopies ?? row.AvailableCopies ?? "");
          const available = isNaN(rawAvailable) || rawAvailable < 1 ? 1 : rawAvailable;

          const rawTotal = parseInt(row.totalCopies ?? row.TotalCopies ?? "");
          const total = isNaN(rawTotal) || rawTotal < available ? undefined : rawTotal;

          return {
            title: (row.title ?? row.Title ?? "").trim() || "Untitled",
            author: (row.author ?? row.Author ?? "").trim() || "Unknown Author",
            availableCopies: available,
            ...(total !== undefined ? { totalCopies: total } : {}),
            isbn: (row.isbn ?? row.ISBN ?? "").trim() || undefined,
            subject: (row.subject ?? row.Subject ?? "").trim() || undefined,
          };
        });

        // Filter out rows that are completely empty
        const valid = books.filter((b) => b.title !== "Untitled" || b.author !== "Unknown Author");

        if (valid.length === 0) {
          setCsvError("No valid book rows found. Check that your CSV has data rows below the header.");
          setParsedBooks([]);
          return;
        }

        setParsedBooks(valid);
      },
    });
  }

  function clearCsvFile() {
    setCsvFileName(null);
    setParsedBooks([]);
    setCsvError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Schools</h1>
          <p className="text-muted-foreground mt-1">{schools?.length ?? 0} registered schools</p>
        </div>
        <Button onClick={() => setOpen(true)} className="flex items-center gap-2 cursor-pointer">
          <Plus className="h-4 w-4" /> Register School
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search schools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((school) => (
          <Card key={school._id} className="border-l-2 border-l-secondary">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{school.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" /> {school.slug}.{getBaseDomain()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    Clerk Org: {school.clerkOrgId}
                  </p>
                </div>

                {/* 3-dot menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenuId(openMenuId === school._id ? null : school._id)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {openMenuId === school._id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpenMenuId(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border bg-card shadow-lg z-50 py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSchool(school);
                            setEditName(school.name);
                            setEditSlug(school.slug);
                            setEditClerkOrgId(school.clerkOrgId);
                            setEditOpen(true);
                            setOpenMenuId(null);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setOpenMenuId(null);
                            if (!confirm(`Delete "${school.name}"?\n\nThe Clerk organisation will also be deleted.`)) return;
                            try {
                              await adminRemove({ id: school._id });
                              toast.success("School and Clerk org deleted");
                            } catch (err: unknown) {
                              const msg = err instanceof Error ? err.message : "Unknown error";
                              toast.error(`Delete failed: ${msg}`);
                            }
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered?.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No schools found</p>
          </div>
        )}
      </div>

      {/* ── Register School Modal (Two-Step Wizard) ───────── */}
      <Modal
        open={open}
        onClose={resetCreateForm}
        title="Register New School"
        size={step === 2 ? "lg" : "md"}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-5">
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-secondary/20 text-secondary"}`}>
            1
          </span>
          <div className={`h-0.5 flex-1 rounded ${step === 2 ? "bg-primary" : "bg-secondary/30"}`} />
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-secondary/20 text-secondary"}`}>
            2
          </span>
          <span className="text-xs text-muted-foreground ml-1">
            {step === 1 ? "School Details" : "Book Inventory"}
          </span>
        </div>

        {/* Step 1: School Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="school-name">School Name</Label>
              <Input
                id="school-name"
                placeholder="e.g. Oakridge Academy"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="school-slug">Subdomain / Slug</Label>
              <Input
                id="school-slug"
                placeholder="e.g. oakridge"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>

            <p className="text-xs text-muted-foreground">
              A Clerk organisation will be created automatically. The school will be accessible at <strong>{slug || "{slug}"}.{getBaseDomain()}</strong> once DNS is configured.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={resetCreateForm} disabled={loading}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!name || !slug}
                onClick={() => setStep(2)}
                className="gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: CSV Upload */}
        {step === 2 && (
          <div className="space-y-5">
            {/* File upload zone */}
            {!csvFileName ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center hover:bg-muted/50 hover:border-primary/40 cursor-pointer transition-all"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".csv"
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Drag & drop a CSV file here
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse your computer
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary text-primary-foreground rounded-lg">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium truncate max-w-[280px]">{csvFileName}</p>
                    <p className="text-xs text-primary font-medium">
                      {parsedBooks.length > 0
                        ? `Ready to import ${parsedBooks.length} book${parsedBooks.length !== 1 ? "s" : ""}`
                        : "Processing..."}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCsvFile}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Error display */}
            {csvError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {csvError}
              </div>
            )}

            {/* Preview table */}
            {parsedBooks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Preview (first 5 rows)
                </p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted text-muted-foreground">
                        <th className="p-2.5 text-left font-medium">Title</th>
                        <th className="p-2.5 text-left font-medium">Author</th>
                        <th className="p-2.5 text-center font-medium">Copies</th>
                        <th className="p-2.5 text-left font-medium">Subject</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedBooks.slice(0, 5).map((book, i) => (
                        <tr key={i} className="bg-card">
                          <td className="p-2.5 font-medium truncate max-w-[180px]">{book.title}</td>
                          <td className="p-2.5 truncate max-w-[120px]">{book.author}</td>
                          <td className="p-2.5 text-center font-mono">{book.availableCopies}</td>
                          <td className="p-2.5">
                            {book.subject ? (
                              <span className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                                {book.subject}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Template download */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border text-xs">
              <p className="text-muted-foreground">
                Need the correct format? Download the CSV template.
              </p>
              <a
                href="/template.csv"
                download
                className="text-primary font-medium hover:underline shrink-0 ml-3"
              >
                Download Template
              </a>
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                disabled={loading}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={loading}
                className="gap-1.5"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {loading ? "Creating..." : "Save & Onboard"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit School Modal ─────────────────────────────── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit School"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editingSchool) return;
            setSaving(true);
            try {
              await adminUpdate({
                id: editingSchool._id,
                name: editName,
                slug: editSlug,
                clerkOrgId: editClerkOrgId,
              });
              toast.success("School updated");
              setEditOpen(false);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              toast.error(`Failed to update: ${msg}`);
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">School Name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-slug">Subdomain / Slug</Label>
            <Input
              id="edit-slug"
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-clerk-org-id">Clerk Organisation ID</Label>
            <Input
              id="edit-clerk-org-id"
              value={editClerkOrgId}
              onChange={(e) => setEditClerkOrgId(e.target.value)}
              required
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Fix the org ID if you made a typo — the school will be re-linked to the correct organisation.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
