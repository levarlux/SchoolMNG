"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Layers, Download, Trash2, RefreshCw, CheckSquare, Square, FileDown, AlertTriangle, CheckCircle2, Upload, ListChecks, FolderOpen, Sparkles } from "lucide-react";
import { ImportStudio } from "@/components/import-studio";
import { IntakePanel } from "@/components/intake-panel";
import { exportToCsv } from "@/lib/csv-export";
import { toast } from "sonner";

const RUN_KIND_LABELS: Record<string, string> = {
  students: "Students",
  staff: "Staff",
  fees: "Fees",
  "fee-payments": "Fee Payments",
  subjects: "Subjects",
  classes: "Classes",
  attendance: "Attendance",
  terms: "Terms",
};

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-green-50 text-green-700 border-green-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-muted text-muted-foreground",
    in_progress: "bg-muted text-muted-foreground",
    created: "bg-green-50 text-green-700 border-green-200",
    skipped: "bg-muted text-muted-foreground",
    overwritten: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };
  return <Badge className={styles[status] ?? ""}>{status}</Badge>;
}

const MODULES = [
  { value: "students", label: "Students", fields: ["status", "gender"] },
  { value: "borrowings", label: "Book Borrowings", fields: ["status"] },
  { value: "discipline_incidents", label: "Discipline Incidents", fields: ["resolutionStatus", "category"] },
  { value: "admission_applications", label: "Admissions", fields: ["status"] },
  { value: "correspondence", label: "Correspondence", fields: ["status", "direction"] },
  { value: "health_records", label: "Health Records", fields: ["bloodType"] },
  { value: "leave_requests", label: "Leave Requests", fields: ["status", "leaveType"] },
  { value: "maintenance_tasks", label: "Maintenance", fields: ["status", "priority"] },
  { value: "compliance_documents", label: "Compliance Docs", fields: ["status", "documentType"] },
] as const;

const STATUS_OPTIONS: Record<string, string[]> = {
  status: ["active", "inactive", "pending", "archived"],
  resolutionStatus: ["open", "investigating", "resolved", "escalated"],
  gender: ["male", "female", "other"],
  direction: ["incoming", "outgoing"],
  leaveType: ["annual", "sick", "maternity", "paternity", "compassionate", "study", "other"],
  priority: ["low", "medium", "high", "urgent"],
  documentType: ["registration", "inspection", "policy", "certificate", "other"],
  bloodType: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
  category: ["uniform", "conduct", "academic", "attendance", "other"],
};

type Step = "select" | "choose" | "confirm" | "done";

export default function BulkOperationsPage() {
  const school = useSchool();
  const [mode, setMode] = useState<"batch" | "import" | "intake" | "files" | "export">("batch");
  const [step, setStep] = useState<Step>("select");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"status" | "delete">("status");
  const [targetField, setTargetField] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: { id: string; reason: string }[] } | null>(null);

  const [expandedRunId, setExpandedRunId] = useState<Id<"import_runs"> | null>(null);
  const [exportRequest, setExportRequest] = useState<"students" | "fee_payments" | null>(null);
  const [exporting, setExporting] = useState(false);

  // Fetch records based on selected module
  const studentsData = useQuery(
    api.students.listBySchool,
    selectedModule === "students" && school ? { schoolId: school._id } : "skip"
  );

  const records = useMemo(() => {
    if (!studentsData) return [];
    // For now, only students has a direct query. Others use report_logs or simple lists.
    switch (selectedModule) {
      case "students":
        return studentsData.map((s) => ({
          id: s._id,
          display: `${s.firstName} ${s.lastName} (${s.admNo})`,
          status: s.status ?? "active",
        }));
      default:
        return [];
    }
  }, [selectedModule, studentsData]);

  const bulkUpdateStatus = useMutation(api.bulkOperations.bulkUpdateStatus);
  const bulkDelete = useAction(api.bulkOperations.bulkDelete);

  const importRuns = useQuery(
    api.imports.listImportRuns,
    school ? { schoolId: school._id } : "skip"
  );
  const exportRuns = useQuery(
    api.exports.listExportRuns,
    school ? { schoolId: school._id } : "skip"
  );
  const runRowResults = useQuery(
    api.imports.getImportRunRowResults,
    expandedRunId ? { runId: expandedRunId } : "skip"
  );
  const studentsExportData = useQuery(
    api.exportData.students,
    school && exportRequest === "students" ? { schoolId: school._id } : "skip"
  );
  const feePaymentsExportData = useQuery(
    api.exportData.feePayments,
    school && exportRequest === "fee_payments" ? { schoolId: school._id } : "skip"
  );

  const deleteImportRun = useMutation(api.imports.deleteImportRun);
  const deleteExportRun = useMutation(api.exports.deleteExportRun);
  const recordExportRun = useMutation(api.exports.recordExportRun);

  const finalizeExport = useCallback(
    async (kind: "students" | "fee_payments", label: string, rows: Record<string, unknown>[]) => {
      if (!school) return;
      try {
        const fileName = `${kind}-${new Date().toISOString().slice(0, 10)}`;
        if (rows.length > 0) exportToCsv(rows, fileName);
        await recordExportRun({
          schoolId: school._id,
          kind,
          label,
          fileName,
          rowCount: rows.length,
        });
        toast.success(`${label} exported — ${rows.length} rows`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      } finally {
        setExporting(false);
        setExportRequest(null);
      }
    },
    [school, recordExportRun]
  );

  useEffect(() => {
    if (exportRequest === "students" && studentsExportData !== undefined) {
      void finalizeExport("students", "Students", studentsExportData);
    }
  }, [exportRequest, studentsExportData, finalizeExport]);

  useEffect(() => {
    if (exportRequest === "fee_payments" && feePaymentsExportData !== undefined) {
      void finalizeExport("fee_payments", "Fee Payments", feePaymentsExportData);
    }
  }, [exportRequest, feePaymentsExportData, finalizeExport]);

  const startExport = (kind: "students" | "fee_payments") => {
    if (!school || exporting) return;
    setExporting(true);
    setExportRequest(kind);
  };

  const handleDeleteImportRun = async (runId: Id<"import_runs">) => {
    try {
      await deleteImportRun({ id: runId });
      toast.success("Import record deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeleteExportRun = async (id: Id<"export_runs">) => {
    try {
      await deleteExportRun({ id });
      toast.success("Export record deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const moduleConfig = MODULES.find((m) => m.value === selectedModule);

  const toggleAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExecute = async () => {
    if (!school || selectedIds.size === 0) return;
    setRunning(true);
    try {
      const ids = [...selectedIds];
      if (bulkAction === "delete") {
        const res = await bulkDelete({ schoolId: school._id, module: selectedModule, ids });
        setResult({ success: res.deleted, errors: res.errors });
      } else {
        const res = await bulkUpdateStatus({
          schoolId: school._id,
          module: selectedModule,
          ids,
          field: targetField,
          value: targetValue,
        });
        setResult({ success: res.updated, errors: res.errors });
      }
      setStep("done");
      toast.success("Bulk operation completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setStep("select");
    setSelectedModule("");
    setSelectedIds(new Set());
    setBulkAction("status");
    setTargetField("");
    setTargetValue("");
    setResult(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Bulk Operations</h1>
          <p className="text-sm text-muted-foreground">
            Select records and perform batch actions across modules
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setMode("batch")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "batch" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListChecks className="h-4 w-4" /> Batch Edit
        </button>
        <button
          onClick={() => setMode("import")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "import" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="h-4 w-4" /> Bulk Import
        </button>
        <button
          onClick={() => setMode("intake")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "intake" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" /> Intake
        </button>
        <button
          onClick={() => setMode("files")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "files" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FolderOpen className="h-4 w-4" /> Files
        </button>
        <button
          onClick={() => setMode("export")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "export" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {mode === "import" && (
        <ImportStudio
          open
          onClose={() => {
            reset();
            setMode("batch");
          }}
        />
      )}

      {mode === "intake" && (
        <IntakePanel onOpenImportStudio={() => setMode("import")} />
      )}

      {mode === "files" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Import History
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Every file processed by the Import Studio, with per-row outcomes.
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {importRuns === undefined ? (
                <div className="flex justify-center py-8">
                  <BrandLoader variant="dots" />
                </div>
              ) : importRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No import runs yet. Run a bulk import and it will appear here.
                </p>
              ) : (
                importRuns.map((run) => {
                  const counts = [
                    run.studentsCreated ? `${run.studentsCreated} students created` : "",
                    run.studentsSkipped ? `${run.studentsSkipped} students skipped` : "",
                    run.studentsOverwritten ? `${run.studentsOverwritten} students updated` : "",
                    run.staffCreated ? `${run.staffCreated} staff created` : "",
                    run.staffSkipped ? `${run.staffSkipped} staff skipped` : "",
                    run.staffOverwritten ? `${run.staffOverwritten} staff updated` : "",
                    run.structuresCreated ? `${run.structuresCreated} structures created` : "",
                    run.errors ? `${run.errors} errors` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No rows recorded";
                  return (
                    <div key={run._id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{run.fileName}</p>
                            <RunStatusBadge status={run.status} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {RUN_KIND_LABELS[run.kind ?? "file"] ?? run.kind ?? "File"} · {new Date(run.runAt).toLocaleString()} · {run.ranBy}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{counts}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedRunId(expandedRunId === run._id ? null : run._id)}
                          >
                            {expandedRunId === run._id ? "Hide rows" : "Rows"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteImportRun(run._id)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      {expandedRunId === run._id && (
                        <div className="mt-3 rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-secondary/5 sticky top-0">
                              <tr>
                                <th className="text-left p-2 font-medium">Row</th>
                                <th className="text-left p-2 font-medium">Kind</th>
                                <th className="text-left p-2 font-medium">Status</th>
                                <th className="text-left p-2 font-medium">Detail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {runRowResults === undefined ? (
                                <tr>
                                  <td colSpan={4} className="p-3 text-center">
                                    <BrandLoader variant="dots" size="sm" />
                                  </td>
                                </tr>
                              ) : runRowResults.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="p-3 text-center text-muted-foreground text-xs">
                                    No per-row details for this run.
                                  </td>
                                </tr>
                              ) : (
                                runRowResults.map((rr) => (
                                  <tr key={rr._id} className="border-t border-border">
                                    <td className="p-2 text-muted-foreground font-mono text-xs">{rr.row}</td>
                                    <td className="p-2">
                                      <Badge variant="outline">{rr.kind}</Badge>
                                    </td>
                                    <td className="p-2">
                                      <RunStatusBadge status={rr.status} />
                                    </td>
                                    <td className="p-2 text-xs">{rr.reason ?? "—"}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileDown className="h-4 w-4" /> Export History
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Every CSV export generated from this school.
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {exportRuns === undefined ? (
                <div className="flex justify-center py-8">
                  <BrandLoader variant="dots" />
                </div>
              ) : exportRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No exports yet. Use the Export tab to download your first CSV.
                </p>
              ) : (
                exportRuns.map((er) => (
                  <div key={er._id} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileDown className="h-4 w-4 text-primary shrink-0" />
                        <p className="font-medium text-sm truncate">{er.label} · {er.fileName}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {er.rowCount} rows · {new Date(er.runAt).toLocaleString()} · {er.ranBy}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteExportRun(er._id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {mode === "export" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Export Data
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Download CSVs of your school data. Every export is recorded in the Files library.
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                onClick={() => startExport("students")}
                disabled={exporting}
                className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
              >
                <FileDown className="h-4 w-4 mb-2 text-primary" />
                <p className="font-medium text-sm">Export Students</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Names, admission numbers, class, stream, guardian contact
                </p>
              </button>
              <button
                onClick={() => startExport("fee_payments")}
                disabled={exporting}
                className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left disabled:opacity-50"
              >
                <FileDown className="h-4 w-4 mb-2 text-primary" />
                <p className="font-medium text-sm">Export Fee Payments</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Payment date, student, amount, method, reference
                </p>
              </button>
            </div>
            {exporting && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <BrandLoader variant="dots" size="sm" /> Generating export…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mode === "batch" && (
        <>
      {/* Progress Steps */}
      <div className="flex items-center gap-1">
        {(["select", "choose", "confirm", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              step === s ? "bg-primary text-primary-foreground" :
              step === "done" || (["select", "choose", "confirm", "done"].indexOf(step) > i) ?
                "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {s === "select" ? "Module" : s === "choose" ? "Records" : s === "confirm" ? "Confirm" : "Done"}
            </div>
            {i < 3 && <div className="w-4 h-px bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Step 1: Select Module */}
          {step === "select" && (
            <div className="space-y-4">
              <h3 className="font-semibold">Select a module to operate on</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MODULES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setSelectedModule(m.value);
                      setStep("choose");
                    }}
                    className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                  >
                    <p className="font-medium text-sm">{m.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {m.fields.length} bulk fields
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Choose Records + Action */}
          {step === "choose" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{moduleConfig?.label} — Select records</h3>
                <Button variant="outline" size="sm" onClick={() => setStep("select")}>Change Module</Button>
              </div>

              {records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No records found for this module.</p>
                  <p className="text-xs mt-1">Only modules with direct data queries are supported for bulk operations.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm">
                      {selectedIds.size === records.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      Select all ({records.length})
                    </button>
                    <Badge>{selectedIds.size} selected</Badge>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/5 sticky top-0">
                        <tr>
                          <th className="w-10 p-2.5"></th>
                          <th className="text-left p-2.5 font-medium">Record</th>
                          <th className="text-left p-2.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.slice(0, 100).map((r) => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                            <td className="p-2.5">
                              <button onClick={() => toggleId(r.id)}>
                                {selectedIds.has(r.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="p-2.5">{r.display}</td>
                            <td className="p-2.5"><Badge>{r.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Action</h4>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setBulkAction("status")}
                        className={`flex-1 p-3 rounded-xl border text-left ${
                          bulkAction === "status" ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <RefreshCw className="h-4 w-4 mb-1" />
                        <p className="text-sm font-medium">Update Status</p>
                      </button>
                      <button
                        onClick={() => setBulkAction("delete")}
                        className={`flex-1 p-3 rounded-xl border text-left ${
                          bulkAction === "delete" ? "border-red-500 bg-red-50" : "border-border"
                        }`}
                      >
                        <Trash2 className="h-4 w-4 mb-1 text-red-500" />
                        <p className="text-sm font-medium">Delete</p>
                      </button>
                    </div>

                    {bulkAction === "status" && (
                      <div className="flex gap-3">
                        <Select value={targetField} onChange={(e) => { setTargetField(e.target.value); setTargetValue(""); }} className="h-10">
                          <option value="">Select field...</option>
                          {moduleConfig?.fields.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </Select>
                        {targetField && (
                          <Select value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="h-10">
                            <option value="">Select value...</option>
                            {(STATUS_OPTIONS[targetField] ?? []).map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </Select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setStep("select")}>Back</Button>
                    <Button
                      onClick={() => setStep("confirm")}
                      disabled={selectedIds.size === 0 || (bulkAction === "status" && (!targetField || !targetValue))}
                    >
                      Review & Confirm
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === "confirm" && (
            <div className="space-y-4">
              <h3 className="font-semibold">Confirm Bulk Operation</h3>
              <div className="p-4 rounded-xl border border-yellow-200 bg-yellow-50">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <p className="font-medium text-yellow-800">Review before proceeding</p>
                </div>
                <ul className="text-sm text-yellow-700 space-y-1">
                  <li>Module: <span className="font-medium">{moduleConfig?.label}</span></li>
                  <li>Action: <span className="font-medium">{bulkAction === "delete" ? "Delete" : `Update ${targetField} → ${targetValue}`}</span></li>
                  <li>Records: <span className="font-medium">{selectedIds.size}</span></li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                This action cannot be undone. Are you sure you want to proceed?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep("choose")} disabled={running}>Back</Button>
                <Button onClick={handleExecute} disabled={running} variant="danger" className="bg-red-600 hover:bg-red-700">
                  {running ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
                  {running ? "Processing..." : `Confirm ${bulkAction === "delete" ? "Delete" : "Update"}`}
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">Operation Complete</p>
                  <p className="text-xs text-green-700 mt-1">
                    {result.success} records {bulkAction === "delete" ? "deleted" : "updated"} · {result.errors.length} errors
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5 sticky top-0">
                      <tr>
                        <th className="text-left p-2.5 font-medium">ID</th>
                        <th className="text-left p-2.5 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.slice(0, 20).map((e, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2.5 text-muted-foreground font-mono text-xs">{e.id.slice(0, 12)}...</td>
                          <td className="p-2.5">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={reset}>Start New Operation</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
