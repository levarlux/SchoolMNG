"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { processDocument } from "@/lib/document-processor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Sparkles, ShieldCheck, CheckCircle2, XCircle,
  FileSpreadsheet, GraduationCap, Users, UserCheck, Search,
  ClipboardCheck, BookOpen,
} from "lucide-react";
import { toast } from "sonner";

// ── Parsing helpers (mirror import-studio so both flows behave identically) ──

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseAmount(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : undefined;
  const s = String(v).trim().replace(/[^0-9.\-]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return isFinite(n) && n > 0 ? n : undefined;
}

function toDateTimestamp(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d{5}$/.test(s) && Number(s) > 20000) {
    const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const dm = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dm) {
    const [, d, m, y] = dm;
    const ts = new Date(`${y.length === 2 ? "20" + y : y}-${m}-${d}`).getTime();
    if (!isNaN(ts)) return ts;
  }
  const ts = Date.parse(s);
  return isNaN(ts) ? undefined : ts;
}

function normalizePaymentMethod(v: unknown): "cash" | "mpesa" | "bank_transfer" | "other" {
  const s = String(v ?? "").trim().toLowerCase();
  if (/cash|cheque|check|bank slip/.test(s)) return "cash";
  if (/mpesa|m-pesa|m pesa|safaricom|mobile money/.test(s)) return "mpesa";
  if (/bank|transfer|wire|eft|rtgs/.test(s)) return "bank_transfer";
  return "other";
}

function normalizeAttendanceStatus(v: unknown): "present" | "absent" | "late" | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (["p", "present", "1", "true", "y", "yes", "v", "✓"].includes(s)) return "present";
  if (["a", "absent", "0", "false", "n", "no", "x", "✗"].includes(s)) return "absent";
  if (["l", "late", "t"].includes(s)) return "late";
  return undefined;
}

async function parseFile(file: File): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  text?: string;
}> {
  let headers: string[] = [];
  let rows: Record<string, unknown>[] = [];
  const processed = await processDocument(file);
  const text = processed.extractedData.find((d) => d.text && d.text.trim().length > 10)?.text;

  if (processed.totalRows === 0 && !text) throw new Error("No data found in the file");

  if (processed.extractedData[0]?.structuredData && processed.extractedData[0].structuredData.length > 0) {
    headers = processed.allHeaders;
    rows = processed.extractedData[0].structuredData;
  } else if (text) {
    const lines = text.split("\n").filter((l) => l.trim());
    const separators = [",", "\t", "|", ";"];
    let bestSeparator = ",";
    let maxColumns = 0;
    for (const sep of separators) {
      const columns = lines[0]?.split(sep).length ?? 0;
      if (columns > maxColumns) {
        maxColumns = columns;
        bestSeparator = sep;
      }
    }
    if (maxColumns > 2) {
      headers = lines[0].split(bestSeparator).map((h) => h.trim());
      rows = lines.slice(1).map((line) => {
        const values = line.split(bestSeparator).map((v) => v.trim());
        const row: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          row[h] = values[i] || "";
        });
        return row;
      });
    }
    if (headers.length === 0 || rows.length === 0) return { headers: [], rows: [], text };
  }

  headers = headers.filter((h) => h.trim() !== "");
  if (headers.length === 0) throw new Error("No column headers found. Make sure the document has tabular data.");
  if (rows.length === 0) throw new Error("No data rows found in the file.");
  return { headers, rows, text };
}

function headerContains(h: string, needles: string[]): boolean {
  const hl = h.toLowerCase();
  return needles.some((n) => hl.includes(n));
}

function pickHeader(headers: string[], needles: string[], used: Set<string>): string | undefined {
  const hit = headers.find((h) => !used.has(h) && headerContains(h, needles));
  if (hit) used.add(hit);
  return hit;
}

// ── Kinds the Intake panel can execute directly ─────────────────────

type ExecutableKind = "fee-payments" | "subjects" | "classes" | "terms" | "attendance";

type Proposal = {
  kind: string;
  label: string;
  summary: string;
  mapping: Record<string, string>;
};

type ParsedFile = { fileName: string; headers: string[]; rows: Record<string, unknown>[]; text?: string };

export function IntakePanel({ onOpenImportStudio }: { onOpenImportStudio: () => void }) {
  const school = useSchool();
  const proposeImport = useAction(api.assistantAgent.proposeImport);
  const importFeePayments = useAction(api.imports.importFeePayments);
  const importSubjects = useAction(api.imports.importSubjects);
  const importClasses = useAction(api.imports.importClasses);
  const importTerms = useAction(api.imports.importTerms);
  const importAttendance = useAction(api.imports.importAttendance);
  const importMarks = useAction(api.marksImport.importMarks);
  const resolveLink = useMutation(api.identity.resolveIdentityLink);
  const dismissLink = useMutation(api.identity.dismissIdentityLink);

  const identityQueue = useQuery(
    api.identity.listIdentityQueue,
    school ? { schoolId: school._id } : "skip"
  );
  const students = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
  const teachers = useQuery(api.teachers.listBySchool, school ? { schoolId: school._id } : "skip");
  const exams = useQuery(api.exams.listBySchool, school ? { schoolId: school._id } : "skip");

  // ── Smart import consent flow ────────────────────────────────────
  const smartInputRef = useRef<HTMLInputElement>(null);
  const [smartFile, setSmartFile] = useState<ParsedFile | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartDone, setSmartDone] = useState<string | null>(null);

  // ── Marks import flow ────────────────────────────────────────────
  const marksInputRef = useRef<HTMLInputElement>(null);
  const [marksFile, setMarksFile] = useState<ParsedFile | null>(null);
  const [examId, setExamId] = useState<string>("");
  const [marksMapping, setMarksMapping] = useState<Record<string, string>>({});
  const [marksBusy, setMarksBusy] = useState(false);
  const [marksResult, setMarksResult] = useState<{
    created: number;
    updated: number;
    needsReview: number;
    errors: { row: number; reason: string }[];
  } | null>(null);

  // ── Identity review queue ────────────────────────────────────────
  const [linkSearch, setLinkSearch] = useState<Record<string, string>>({});
  const [linkPick, setLinkPick] = useState<Record<string, string>>({});
  const [busyLink, setBusyLink] = useState<string | null>(null);

  async function handleSmartFiles(files: File[]) {
    const file = files[0];
    if (!file || !school) return;
    setSmartBusy(true);
    setProposal(null);
    setSmartDone(null);
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) {
        toast.error("This looks like a document, not a table — use the Files area for school documents.");
        return;
      }
      setSmartFile({ fileName: file.name, ...parsed });
      const sampleRows = parsed.rows.slice(0, 5).map((r) =>
        Object.fromEntries(parsed.headers.map((h) => [h, cellToString(r[h])]))
      );
      const p = await proposeImport({
        schoolId: school._id,
        fileName: file.name,
        headers: parsed.headers,
        sampleRows,
      });
      setProposal(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setSmartBusy(false);
    }
  }

  function setProposalMapping(key: string, value: string) {
    setProposal((p) => (p ? { ...p, mapping: { ...p.mapping, [key]: value } } : p));
  }

  async function approveProposal() {
    if (!school || !proposal || !smartFile) return;
    const { kind, mapping } = proposal;
    const raw = smartFile.rows;

    // Marks → hand off to the marks importer with the mapping pre-applied.
    if (kind === "marks") {
      setMarksFile(smartFile);
      setMarksMapping(mapping);
      setMarksResult(null);
      setProposal(null);
      setSmartFile(null);
      toast.info("Opened the marks importer with your file pre-mapped.");
      return;
    }
    // Students / staff / fee schedules → the Import Studio is the full pipeline
    // (duplicate resolution, class creation). Open it — it classifies and maps
    // the same file automatically.
    if (kind === "students" || kind === "staff" || kind === "fees") {
      setProposal(null);
      setSmartFile(null);
      onOpenImportStudio();
      toast.info("This file needs the Import Studio (duplicates & class handling). It is open — drop the file there.");
      return;
    }

    setSmartBusy(true);
    try {
      const executable = kind as ExecutableKind;
      if (executable === "fee-payments") {
        const rows = raw
          .map((r) => {
            const amount = parseAmount(mapping.amountPaid ? r[mapping.amountPaid] : undefined);
            const admNo = cellToString(mapping.admNo ? r[mapping.admNo] : "");
            const studentName =
              cellToString(mapping.studentName ? r[mapping.studentName] : "") ||
              cellToString(mapping.fullName ? r[mapping.fullName] : "");
            if (!amount) return null;
            return {
              admNo: admNo || studentName,
              amount,
              method: normalizePaymentMethod(mapping.method ? r[mapping.method] : undefined),
              date: toDateTimestamp(mapping.date ? r[mapping.date] : undefined),
              reference: cellToString(mapping.reference ? r[mapping.reference] : undefined) || undefined,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null && x.admNo !== "");
        const res = await importFeePayments({ schoolId: school._id, rows });
        const dropped = raw.length - rows.length;
        setSmartDone(
          `Fee payments: ${res.created} recorded · ${res.errors.length} errors` +
            (dropped > 0 ? ` · ${dropped} rows skipped (missing admission number or amount)` : "")
        );
      } else if (executable === "subjects") {
        const rows = raw
          .map((r) => {
            const name = cellToString(mapping.subjectName ? r[mapping.subjectName] : "");
            if (!name) return null;
            return {
              name,
              code: cellToString(mapping.subjectCode ? r[mapping.subjectCode] : "") || `SUB-${Math.floor(Math.random() * 900 + 100)}`,
              level: "general",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const res = await importSubjects({ schoolId: school._id, rows });
        setSmartDone(`Subjects: ${res.created} created · ${res.skipped} skipped · ${res.errors.length} errors`);
      } else if (executable === "classes") {
        const rows = raw
          .map((r) => {
            const className = cellToString(mapping.feeClassName ? r[mapping.feeClassName] : "") || cellToString(mapping.className ? r[mapping.className] : "");
            if (!className) return null;
            return { className, streamName: cellToString(mapping.feeStreamName ? r[mapping.feeStreamName] : "") || undefined };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const res = await importClasses({ schoolId: school._id, rows });
        setSmartDone(`Classes: ${res.classesCreated} created · ${res.streamsCreated} streams · ${res.skipped} skipped · ${res.errors.length} errors`);
      } else if (executable === "terms") {
        const rows = raw
          .map((r) => {
            const name = cellToString(mapping.termName ? r[mapping.termName] : "");
            const year = Number(cellToString(mapping.termYear ? r[mapping.termYear] : "").replace(/\D/g, ""));
            if (!name || !(year > 2000)) return null;
            return {
              name,
              year,
              startDate: toDateTimestamp(mapping.startDate ? r[mapping.startDate] : undefined) ?? 0,
              endDate: toDateTimestamp(mapping.endDate ? r[mapping.endDate] : undefined) ?? 0,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const res = await importTerms({ schoolId: school._id, rows });
        setSmartDone(`Terms: ${res.termsCreated} created · ${res.errors.length} errors`);
      } else if (executable === "attendance") {
        const records = raw
          .map((r) => {
            const admNo = cellToString(mapping.admNo ? r[mapping.admNo] : "") || cellToString(mapping.studentName ? r[mapping.studentName] : "");
            const status = normalizeAttendanceStatus(mapping.attendStatus ? r[mapping.attendStatus] : undefined);
            if (!admNo || !status) return null;
            return { admNo, status };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const res = await importAttendance({
          schoolId: school._id,
          date: toDateTimestamp(mapping.date ? raw[0]?.[mapping.date] : undefined) ?? Date.now(),
          records,
        });
        setSmartDone(`Attendance: ${res.created} recorded · ${res.errors.length} errors`);
      }
      setProposal(null);
      setSmartFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setSmartBusy(false);
    }
  }

  // ── Marks file handling ──────────────────────────────────────────
  async function handleMarksFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setMarksBusy(true);
    setMarksResult(null);
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0) {
        toast.error("No tabular data found in this file.");
        return;
      }
      setMarksFile({ fileName: file.name, ...parsed });
      // Auto-map marks columns.
      const used = new Set<string>();
      setMarksMapping({
        admNo: pickHeader(parsed.headers, ["adm", "admission", "reg no", "student no", "index no"], used) ?? "",
        studentName: pickHeader(parsed.headers, ["student name", "learner name", "pupil name", "full name", " name"], used) ?? "",
        className: pickHeader(parsed.headers, ["class", "grade", "form", "stream"], used) ?? "",
        subjectName: pickHeader(parsed.headers, ["subject", "course"], used) ?? "",
        marks: pickHeader(parsed.headers, ["score", "marks", "mark"], used) ?? "",
        grade: pickHeader(parsed.headers, ["grade"], used) ?? "",
        comment: pickHeader(parsed.headers, ["comment", "remark", "teacher comment"], used) ?? "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setMarksBusy(false);
    }
  }

  function setMarksField(key: string, value: string) {
    setMarksMapping((m) => ({ ...m, [key]: value }));
  }

  async function runMarksImport() {
    if (!school || !marksFile || !examId) return;
    const { mapping } = { mapping: marksMapping };
    const rows = marksFile.rows
      .map((r) => {
        // Marks allow 0 — a student can legitimately score zero.
        const rawMarks = cellToString(mapping.marks ? r[mapping.marks] : "");
        const parsed = Number(rawMarks.replace(/[^0-9.\-]/g, ""));
        const marksVal = rawMarks !== "" && isFinite(parsed) && parsed >= 0 ? parsed : undefined;
        if (marksVal === undefined) return null;
        return {
          admNo: mapping.admNo ? cellToString(r[mapping.admNo]) || undefined : undefined,
          studentName: mapping.studentName ? cellToString(r[mapping.studentName]) || undefined : undefined,
          className: mapping.className ? cellToString(r[mapping.className]) || undefined : undefined,
          subjectName: mapping.subjectName ? cellToString(r[mapping.subjectName]) : "",
          marks: marksVal,
          grade: mapping.grade ? cellToString(r[mapping.grade]) || undefined : undefined,
          comment: mapping.comment ? cellToString(r[mapping.comment]) || undefined : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.subjectName !== "");

    if (rows.length === 0) {
      toast.error("No rows could be mapped — check the Subject and Marks columns.");
      return;
    }
    setMarksBusy(true);
    setMarksResult(null);
    try {
      let created = 0, updated = 0, needsReview = 0;
      const errors: { row: number; reason: string }[] = [];
      for (let start = 0; start < rows.length; start += 1000) {
        const chunk = rows.slice(start, start + 1000);
        const res = await importMarks({
          schoolId: school._id,
          examId: examId as Id<"exams">,
          rows: chunk,
        });
        created += res.created;
        updated += res.updated;
        needsReview += res.needsReview;
        errors.push(...res.errors.map((e) => ({ row: e.row + start, reason: e.reason })));
      }
      setMarksResult({ created, updated, needsReview, errors: errors.slice(0, 200) });
      toast.success(`Marks imported — ${created} recorded, ${updated} updated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Marks import failed");
    } finally {
      setMarksBusy(false);
    }
  }

  // ── Identity queue ───────────────────────────────────────────────
  const peopleByLink = useMemo(() => {
    const map: Record<string, { id: string; name: string; type: "student" | "staff" }[]> = {};
    for (const link of identityQueue ?? []) {
      const q = (linkSearch[link._id] ?? "").toLowerCase();
      const people: { id: string; name: string; type: "student" | "staff" }[] = [];
      if (link.entityKind === "student") {
        for (const s of students ?? []) {
          const name = `${s.firstName} ${s.lastName}`.toLowerCase();
          if (!q || name.includes(q)) {
            people.push({ id: s._id, name: `${s.firstName} ${s.lastName} (${s.admNo})`, type: "student" });
          }
        }
      } else {
        for (const t of teachers ?? []) {
          const name = `${t.firstName} ${t.lastName}`.toLowerCase();
          if (!q || name.includes(q)) {
            people.push({ id: t._id, name: `${t.firstName} ${t.lastName} (${t.staffNo})`, type: "staff" });
          }
        }
      }
      map[link._id] = people.slice(0, 30);
    }
    return map;
  }, [identityQueue, students, teachers, linkSearch]);

  async function handleResolve(linkId: string) {
    const picked = linkPick[linkId];
    if (!picked) {
      toast.error("Search and pick the right person first.");
      return;
    }
    setBusyLink(linkId);
    try {
      await resolveLink({ linkId: linkId as Id<"identity_links">, resolvedId: picked as Id<"students"> | Id<"teachers"> });
      toast.success("Linked — this row will match automatically from now on.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resolve");
    } finally {
      setBusyLink(null);
    }
  }

  async function handleDismiss(linkId: string) {
    setBusyLink(linkId);
    try {
      await dismissLink({ linkId: linkId as Id<"identity_links"> });
      toast.success("Dismissed — the record will be created separately.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not dismiss");
    } finally {
      setBusyLink(null);
    }
  }

  const pendingQueue = identityQueue?.filter((l) => l.status === "needs_review") ?? [];

  return (
    <div className="space-y-6">
      {/* ── Smart Import ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Smart Import
          </CardTitle>
          <CardDescription>
            Drop a file. The assistant reads it, decides what it is, and maps its columns — you review and approve before anything is written.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <input
            ref={smartInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt,.doc,.docx,.pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleSmartFiles([...e.target.files]);
              e.target.value = "";
            }}
          />
          {!proposal && (
            <button
              onClick={() => smartInputRef.current?.click()}
              disabled={smartBusy}
              className="w-full p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-center disabled:opacity-60"
            >
              {smartBusy ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <BrandLoader variant="dots" size="sm" /> Reading file…
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="font-medium text-sm">Drop a file — fees, marks, subjects, classes, terms, attendance</p>
                  <p className="text-xs text-muted-foreground mt-1">CSV · Excel · text · PDF tables</p>
                </>
              )}
            </button>
          )}

          {proposal && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{smartFile?.fileName}</p>
                    <Badge>{proposal.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{proposal.summary}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Column mapping — edit before approving</p>
                <div className="rounded-lg border border-border bg-background overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(proposal.mapping).map(([key, header]) => (
                        <tr key={key} className="border-t border-border first:border-t-0">
                          <td className="p-2 pl-3 w-1/2">
                            <span className="font-mono text-xs">{key}</span>
                          </td>
                          <td className="p-2 pr-3">
                            <Select
                              value={header}
                              onChange={(e) => setProposalMapping(key, e.target.value)}
                              className="h-8 text-xs"
                            >
                              <option value="">— unmapped —</option>
                              {smartFile?.headers.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                      {Object.keys(proposal.mapping).length === 0 && (
                        <tr>
                          <td colSpan={2} className="p-3 text-xs text-muted-foreground text-center">
                            No columns matched automatically — use the Import Studio to map manually.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {smartDone && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> {smartDone}
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Nothing is written until you approve.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setProposal(null); setSmartFile(null); setSmartDone(null); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void approveProposal()} disabled={smartBusy}>
                    {smartBusy ? <BrandLoader variant="dots" size="sm" /> : <><ClipboardCheck className="h-4 w-4 mr-1.5" /> Approve & Import</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Marks Import ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-primary" /> Marks / Exam Results
          </CardTitle>
          <CardDescription>
            Import your marks file (one row per student + subject). Students link by admission number first, then by name — ambiguous names go to the review queue below.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Exam</label>
              <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">Select an exam…</option>
                {exams === undefined ? (
                  <option disabled>Loading exams…</option>
                ) : exams.length === 0 ? (
                  <option disabled>No exams yet — create one in the Exams page first</option>
                ) : (
                  exams.map((ex) => (
                    <option key={ex._id} value={ex._id}>{ex.name}</option>
                  ))
                )}
              </Select>
            </div>
            <Button variant="outline" onClick={() => marksInputRef.current?.click()} disabled={marksBusy || !examId}>
              <Upload className="h-4 w-4 mr-1.5" /> {marksFile ? "Choose another file" : "Upload marks file"}
            </Button>
            <input
              ref={marksInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleMarksFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
          </div>

          {marksFile && (
            <div className="rounded-xl border border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">{marksFile.fileName}</p>
                <Badge variant="outline">{marksFile.rows.length} rows</Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["admNo", "Admission No"],
                  ["studentName", "Student Name"],
                  ["className", "Class"],
                  ["subjectName", "Subject"],
                  ["marks", "Marks / Score"],
                  ["grade", "Grade (optional)"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                    <Select
                      value={marksMapping[key] ?? ""}
                      onChange={(e) => setMarksField(key, e.target.value)}
                      className="h-9"
                    >
                      <option value="">— not mapped —</option>
                      {marksFile.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/5 sticky top-0">
                    <tr>
                      {(["Admission", "Name", "Subject", "Marks"]).map((h) => (
                        <th key={h} className="text-left p-2 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {marksFile.rows.slice(0, 15).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 font-mono">{marksMapping.admNo ? cellToString(r[marksMapping.admNo]) : "—"}</td>
                        <td className="p-2">{marksMapping.studentName ? cellToString(r[marksMapping.studentName]) : "—"}</td>
                        <td className="p-2">{marksMapping.subjectName ? cellToString(r[marksMapping.subjectName]) : "—"}</td>
                        <td className="p-2">{marksMapping.marks ? cellToString(r[marksMapping.marks]) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {marksResult && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge className="bg-green-50 text-green-700 border-green-200">{marksResult.created} recorded</Badge>
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200">{marksResult.updated} updated</Badge>
                    {marksResult.needsReview > 0 && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200">{marksResult.needsReview} → review queue</Badge>
                    )}
                    <Badge className={marksResult.errors.length > 0 ? "bg-red-50 text-red-700 border-red-200" : ""}>
                      {marksResult.errors.length} errors
                    </Badge>
                  </div>
                  {marksResult.errors.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1 max-h-32 overflow-y-auto">
                      {marksResult.errors.slice(0, 10).map((e, i) => (
                        <p key={i} className="text-xs text-red-700">Row {e.row}: {e.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => void runMarksImport()} disabled={marksBusy || !examId}>
                  {marksBusy ? <BrandLoader variant="dots" size="sm" /> : <><BookOpen className="h-4 w-4 mr-1.5" /> Import {marksFile.rows.length} rows</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Identity Review Queue ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Identity Review Queue
            {pendingQueue.length > 0 && <Badge>{pendingQueue.length} awaiting your call</Badge>}
          </CardTitle>
          <CardDescription>
            Rows that could not be safely matched to a person. Pick the right one once — the system remembers forever. Nothing is silently dropped.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {identityQueue === undefined ? (
            <div className="flex justify-center py-8"><BrandLoader variant="dots" /></div>
          ) : pendingQueue.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <UserCheck className="h-6 w-6 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nothing needs your attention — every row matched cleanly.</p>
            </div>
          ) : (
            pendingQueue.map((link) => (
              <div key={link._id} className="rounded-xl border border-border p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{link.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words font-mono">{link.rowKey}</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline">{link.entityKind}</Badge>
                      {link.sourceFile && <Badge variant="outline">{link.sourceFile}</Badge>}
                      <Badge variant="outline">confidence {Math.round(link.confidence)}%</Badge>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void handleDismiss(link._id)} disabled={busyLink === link._id}>
                    <XCircle className="h-4 w-4 mr-1" /> Not a match
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder={`Search ${link.entityKind === "staff" ? "staff" : "students"}…`}
                      className="pl-8 h-9"
                      value={linkSearch[link._id] ?? ""}
                      onChange={(e) => setLinkSearch((s) => ({ ...s, [link._id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleResolve(link._id)}
                    disabled={busyLink === link._id || !linkPick[link._id]}
                  >
                    {busyLink === link._id ? <BrandLoader variant="dots" size="sm" /> : <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Link to person</>}
                  </Button>
                </div>

                {peopleByLink[link._id] && peopleByLink[link._id].length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {peopleByLink[link._id].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setLinkPick((s) => ({ ...s, [link._id]: p.id }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          linkPick[link._id] === p.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40 text-muted-foreground"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {linkPick[link._id] && (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Will link to: {peopleByLink[link._id]?.find((p) => p.id === linkPick[link._id])?.name}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
