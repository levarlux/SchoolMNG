"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { FieldRenderer } from "./generic/FieldRenderer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Camera, Phone, Mail, MapPin, GraduationCap, Calendar, BookMarked, CircleDollarSign, UserCheck, UserX, Clock, Printer, AlertTriangle, CheckCircle2, Users, Layers, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FeePaymentModal } from "./fee-payment-modal";

// â”€â”€ Fees Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type StudentFeesData = {
  term: { _id: string; name: string; year: number };
  expected: number;
  creditFromPrior: number;
  effectiveExpected: number;
  paid: number;
  balance: number;
  credit: number;
  schoolOwes: number;
  hasStructure: boolean;
  payments: Array<{
    _id: string;
    amount: number;
    method: string;
    reference?: string;
    note?: string;
    receivedAt: number;
  }>;
};

function FeePaymentHistory({ fees }: { fees: StudentFeesData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payment History</CardTitle>
        <CardDescription>{fees.term.name} {fees.term.year}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-2.5 font-medium">Date</th>
                <th className="text-right p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Method</th>
                <th className="text-left p-2.5 font-medium">Reference</th>
                <th className="text-left p-2.5 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {fees.payments.map((p) => (
                <tr key={p._id} className="border-t border-border">
                  <td className="p-2.5">
                    {new Date(p.receivedAt).toLocaleDateString("en-KE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-2.5 text-right font-semibold text-green-600">
                    KES {p.amount.toLocaleString("en-KE")}
                  </td>
                  <td className="p-2.5 capitalize">{p.method.replace("_", " ")}</td>
                  <td className="p-2.5 text-muted-foreground">{p.reference ?? ""}</td>
                  <td className="p-2.5 text-muted-foreground">{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function FeesTab({
  studentId,
  fees,
  isLeadership,
}: {
  studentId: string;
  fees: StudentFeesData | null;
  isLeadership: boolean;
}) {
  const [showPay, setShowPay] = useState(false);

  if (!fees) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center">
          <CircleDollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">No Current Term</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Set a current term to see this student&apos;s fee information.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No fee structure means we can't compute expected/balance, but a student may
  // still have payments on record — always surface that fee stub instead of
  // hiding everything behind the "No Fee Structure" gate.
  if (!fees.hasStructure) {
    const hasPayments = fees.payments.length > 0;
    return (
      <div className="space-y-4">
        <Card className="border-dashed">
          <CardContent className="p-6 flex items-start gap-3">
            <CircleDollarSign className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">No fee amount set for this class</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                No fee structure has been set for this student&apos;s class for{" "}
                {fees.term.name} {fees.term.year}.
                {hasPayments
                  ? " Payments made are still recorded below."
                  : " No payments have been recorded either."}
              </p>
              {isLeadership && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => window.open("/dashboard/fees", "_self")}>
                  Set up fees →
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <FeePaymentHistory fees={fees} />

        <FeePaymentModal
          open={showPay}
          onClose={() => setShowPay(false)}
          studentId={studentId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <div>
              <p className="text-lg font-bold">KES {fees.expected.toLocaleString("en-KE")}</p>
              <p className="text-xs text-muted-foreground">Expected this term</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold">KES {fees.paid.toLocaleString("en-KE")}</p>
              <p className="text-xs text-muted-foreground">Paid</p>
            </div>
          </CardContent>
        </Card>
        <Card className={fees.balance > 0 ? "border-red-200" : fees.balance < 0 ? "border-amber-200" : "border-green-200"}>
          <CardContent className="p-4 flex items-center gap-3">
            {fees.balance > 0 ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : fees.balance < 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            <div>
              <p className={`text-lg font-bold ${fees.balance > 0 ? "text-red-600" : fees.balance < 0 ? "text-amber-600" : "text-green-600"}`}>
                KES {Math.abs(fees.balance).toLocaleString("en-KE")}
              </p>
              <p className="text-xs text-muted-foreground">
                {fees.balance > 0 ? "Outstanding" : fees.balance < 0 ? "School owes this student" : "Fully paid"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {fees.creditFromPrior > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-primary">KES {fees.creditFromPrior.toLocaleString("en-KE")}</span>{" "}
          credit from earlier terms applied to {fees.term.name} {fees.term.year}.
        </p>
      )}
      {fees.schoolOwes > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            This student paid <span className="font-semibold">KES {fees.schoolOwes.toLocaleString("en-KE")}</span> more
            than owed — the school owes them this credit.
          </p>
        </div>
      )}

      {isLeadership && fees.balance > 0 && (
        <Button onClick={() => setShowPay(true)}>
          <CircleDollarSign className="h-4 w-4 mr-1.5" /> Record Payment
        </Button>
      )}

      {fees.payments.length > 0 && <FeePaymentHistory fees={fees} />}

      <FeePaymentModal
        open={showPay}
        onClose={() => setShowPay(false)}
        studentId={studentId}
      />
    </div>
  );
}

const STATUS_VARIANT: Record<string, "success" | "default" | "warning" | "danger" | "secondary"> = {
  active: "success",
  graduated: "secondary",
  withdrawn: "warning",
  suspended: "danger",
};

function fmtDate(ts?: number | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

// Phase 18: DOB / admission date are school-defined EAV fields. Their values
// may be an ISO date string or a numeric-timestamp string — normalize either
// into display text.
function fmtEavDate(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  if (Number.isFinite(n)) return fmtDate(n);
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? trimmed : fmtDate(d.getTime());
}

/**
 * Student 360 profile view (Phase 1). Rendered as a full-page view on the
 * static /dashboard/students route via the ?view=<studentId> query param —
 * dynamic [id] routes can't be served with `output: export`.
 */
export function StudentProfileView({ studentId }: { studentId: string }) {
  const [now] = useState(() => Date.now());
  const id = studentId;
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  const profile = useQuery(api.studentProfiles.getFullProfile, { id: id as any });
  const classes = useQuery(api.classes.listBySchool, profile?.student.schoolId ? { schoolId: profile.student.schoolId } : "skip");
  const updateStudent = useMutation(api.students.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const setStudentPhoto = useMutation(api.files.setStudentPhoto);
  const createRecord = useMutation(api.records.create);
  const setEavValues = useMutation(api.fieldValues.setValues);

  const [tab, setTab] = useState<"overview" | "academics" | "attendance" | "library" | "fees" | "modules">("overview");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // â”€â”€ Edit form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const student = profile?.student;
  const eavData = useQuery(
    api.records.getStudentEavModules,
    student ? { studentId: student._id } : "skip"
  );
  const [form, setForm] = useState<Record<string, string>>({});
  // Editable EAV form: keyed by fieldId, initialized from the (pre-filled)
  // query result. `dirty` stops the query refetch from clobbering edits.
  const [eavForm, setEavForm] = useState<Record<string, string>>({});
  const [eavDirty, setEavDirty] = useState(false);
  const [eavSaving, setEavSaving] = useState(false);

  useEffect(() => {
    if (!student) return;
    // Phase 18: gender / DOB / admissionDate / guardian are no longer student
    // columns. They're filled from the joined EAV + guardian entity reads.
    setForm({
      firstName: student.firstName,
      lastName: student.lastName,
      admNo: student.admNo,
      classId: student.classId,
      streamId: student.streamId ?? "",
      gender: profile?.eav?.gender ?? "",
      dateOfBirth: profile?.eav?.dateOfBirth ?? "",
      admissionDate: profile?.eav?.admissionDate ?? "",
      status: student.status ?? "active",
      guardianName: profile?.guardian ? `${profile.guardian.firstName} ${profile.guardian.lastName}`.trim() : "",
      guardianRelation: profile?.guardian?.relationship ?? "",
      guardianPhone: profile?.guardian?.phone ?? "",
      guardianPhone2: profile?.guardian?.phone2 ?? "",
      guardianEmail: profile?.guardian?.email ?? "",
      homeAddress: profile?.guardian?.address ?? "",
      emergencyName: "",
      emergencyPhone: "",
    });
  }, [student, profile]);

  // Initialize the editable EAV form from the query result. The query returns
  // engine-known values pre-filled (stored EAV rows win over derived ones), so
  // saving persists them as real EAV data — nothing needs to be re-typed.
  useEffect(() => {
    if (!eavData || eavDirty) return;
    const map: Record<string, string> = {};
    for (const mod of eavData.modules) {
      for (const sec of mod.sections) {
        for (const f of sec.fields) map[f.fieldId] = f.value ?? "";
      }
    }
    setEavForm(map);
  }, [eavData, eavDirty]);

  const streamsQuery = useQuery(
    api.streams.listByClass,
    form.classId ? { classId: form.classId as any } : "skip"
  );

  // â”€â”€ Access control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // getFullProfile throws when the caller isn't leadership, and a thrown
  // query leaves useQuery returning undefined forever — so short-circuit
  // with an explicit message instead of an endless spinner.
  if (role !== undefined && !isLeadership) {
    return (
      <div className="p-8 text-center">
        <p className="font-medium">Not authorized</p>
        <p className="text-sm text-muted-foreground mt-1">Student profiles are available to the principal.</p>
        <Link href="/dashboard" className="text-primary hover:underline text-sm inline-block mt-3">
          â† Back to dashboard
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  // ──── Derived stats ────────────────────────────────────────────────────────
  const activeBorrowings = profile?.borrowings.filter((b) => b.status === "borrowed") ?? [];
  const overdue = activeBorrowings.filter((b) => b.dueDate < now);
  const unpaidFines = (profile?.fines ?? []).filter((f) => f.status === "unpaid");
  const unpaidTotal = unpaidFines.reduce((s, f) => s + (f.outstanding ?? 0), 0);
  const attendanceRecords = profile?.attendance.records ?? [];
  const attended = (profile?.attendance.counts.present ?? 0) + (profile?.attendance.counts.late ?? 0);
  const attendanceTotal = attendanceRecords.length;
  const attendanceRate = attendanceTotal > 0 ? Math.round((attended / attendanceTotal) * 100) : null;

  if (profile === undefined) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Student not found.</p>
        <Link href="/dashboard/students" className="text-primary hover:underline text-sm">
          â† Back to students
        </Link>
      </div>
    );
  }

  const s = profile.student;
  const cls = profile.class;
  const stream = profile.stream;

  // â”€â”€ Photo upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handlePhoto(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      await setStudentPhoto({ studentId: s._id, storageId });
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateStudent({
        id: s._id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        admNo: form.admNo.trim(),
        classId: form.classId as any,
        streamId: form.streamId ? (form.streamId as any) : undefined,
        status: (form.status || undefined) as any,
      });
      // Phase 18: gender / DOB / admissionDate are school-defined EAV fields
      // (edited via the EAV Modules tab); guardian contact is managed in the
      // guardian ENTITY (Guardians page). None of them belong on the student
      // doc, so the typed-core update is the complete save here.
      toast.success("Student updated");
      setShowEdit(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  // Persist the EAV Modules tab. Creates the student's EAV record on first
  // save, then batches every non-empty field value through setValues.
  async function handleEavSave() {
    if (!s) return;
    setEavSaving(true);
    try {
      let recordId = eavData?.recordId ?? null;
      if (!recordId) {
        recordId = await createRecord({
          schoolId: s.schoolId,
          bucket: "learner",
          displayName: `${s.firstName} ${s.lastName}`.trim(),
          status: s.status ?? undefined,
          studentId: s._id,
        });
      }
      const entries = Object.entries(eavForm).filter(([, v]) => v !== "");
      if (entries.length > 0) {
        await setEavValues({
          schoolId: s.schoolId,
          recordId,
          values: entries.map(([fieldId, value]) => ({
            fieldId: fieldId as any,
            value,
          })),
        });
      }
      setEavDirty(false);
      toast.success("Student data saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save student data");
    } finally {
      setEavSaving(false);
    }
  }

  const TABS = [
    { key: "overview" as const, label: "Overview" },
    { key: "academics" as const, label: "Academics" },
    { key: "attendance" as const, label: "Attendance" },
    { key: "library" as const, label: "Library" },
    { key: "fees" as const, label: "Fees" },
    { key: "modules" as const, label: "EAV Modules" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/dashboard/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Link>

      {/* â”€â”€ Header card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card>
        <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            {s.photoUrl ? (
              <img src={s.photoUrl} alt={`${s.firstName} ${s.lastName}`} className="h-20 w-20 rounded-2xl object-cover border border-border" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
                {s.firstName[0]}{s.lastName[0]}
              </div>
            )}
            {isLeadership && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePhoto(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
                  title="Upload photo"
                >
                  {uploading ? <BrandLoader variant="dots" size="sm" /> : <Camera className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{s.firstName} {s.lastName}</h1>
              <Badge variant={STATUS_VARIANT[s.status ?? "active"] ?? "default"}>
                {s.status ?? "active"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Adm No <span className="font-semibold text-foreground">{s.admNo}</span>
              {" Â· "}{cls?.name ?? ""}{stream ? ` Â· ${stream.name}` : ""}
              {profile.eav?.gender && <> Â· <span className="capitalize">{profile.eav.gender}</span></>}
            </p>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> DOB {fmtEavDate(profile.eav?.dateOfBirth)}</span>
              <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> Admitted {fmtEavDate(profile.eav?.admissionDate)}</span>
              {profile.guardian?.phone && (
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {profile.guardian.phone}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLeadership && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1.5" /> Print
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* â”€â”€ Quick stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <BookMarked className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-xl font-bold">{activeBorrowings.length}</p>
              <p className="text-xs text-muted-foreground">Books out</p>
            </div>
          </CardContent>
        </Card>
        <Card className={overdue.length > 0 ? "border-red-200" : ""}>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${overdue.length > 0 ? "text-red-600" : "text-muted-foreground"}`} />
            <div>
              <p className="text-xl font-bold">{overdue.length}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xl font-bold">{attendanceRate === null ? "—" : `${attendanceRate}%`}</p>
              <p className="text-xs text-muted-foreground">Attendance</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CircleDollarSign className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-xl font-bold">KES {unpaidTotal.toLocaleString("en-KE")}</p>
              <p className="text-xs text-muted-foreground">Unpaid fines</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Full name</span><span className="font-medium">{s.firstName} {s.lastName}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Admission no</span><span className="font-medium">{s.admNo}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Class / Stream</span><span className="font-medium">{cls?.name ?? ""}{stream ? ` / ${stream.name}` : ""}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Gender</span><span className="font-medium capitalize">{profile.eav?.gender ?? ""}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Date of birth</span><span className="font-medium">{fmtEavDate(profile.eav?.dateOfBirth)}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Admission date</span><span className="font-medium">{fmtEavDate(profile.eav?.admissionDate)}</span></div>
              <div className="flex justify-between py-1"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{s.status ?? "active"}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Parent / Guardian
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Name</span><span className="font-medium">{profile.guardian ? `${profile.guardian.firstName} ${profile.guardian.lastName}`.trim() : ""}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Relationship</span><span className="font-medium capitalize">{profile.guardian?.relationship ?? ""}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-primary" /> {profile.guardian?.phone ?? ""}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/60"><span className="text-muted-foreground">Alternative phone</span><span className="font-medium">{profile.guardian?.phone2 ?? ""}</span></div>
              <div className="flex justify-between py-1 border-b border-border/60">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-primary" /> {profile.guardian?.email ?? ""}
                </span>
              </div>
              <div className="flex justify-between py-1"><span className="text-muted-foreground">Home address</span><span className="font-medium inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> {profile.guardian?.address ?? ""}
                </span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* â”€â”€ Academics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === "academics" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Exam Results</CardTitle>
            <CardDescription>Latest results first</CardDescription>
          </CardHeader>
          <CardContent>
            {profile.examResults.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                No exam results recorded yet. Results appear here once entered in Exams.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/5">
                    <tr>
                      <th className="text-left p-2.5 font-medium">Exam</th>
                      <th className="text-left p-2.5 font-medium">Date</th>
                      <th className="text-left p-2.5 font-medium">Subject</th>
                      <th className="text-right p-2.5 font-medium">Marks</th>
                      <th className="text-right p-2.5 font-medium">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.examResults.slice(0, 50).map((r) => (
                      <tr key={r._id} className="border-t border-border">
                        <td className="p-2.5 font-medium">{r.examName}</td>
                        <td className="p-2.5 text-muted-foreground">{fmtDate(r.examDate)}</td>
                        <td className="p-2.5">{r.subjectName}</td>
                        <td className="p-2.5 text-right font-semibold">{r.marks}</td>
                        <td className="p-2.5 text-right">{r.grade ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* â”€â”€ Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === "attendance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Present", value: profile.attendance.counts.present, color: "text-green-600", icon: UserCheck },
              { label: "Late", value: profile.attendance.counts.late, color: "text-yellow-600", icon: Clock },
              { label: "Absent", value: profile.attendance.counts.absent, color: "text-red-600", icon: UserX },
              { label: "Excused", value: profile.attendance.counts.excused, color: "text-muted-foreground", icon: CheckCircle2 },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                    <div>
                      <p className="text-xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Date</th>
                    <th className="text-left p-2.5 font-medium">Status</th>
                    <th className="text-left p-2.5 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.attendance.records.slice(0, 50).map((a) => (
                    <tr key={a._id} className="border-t border-border">
                      <td className="p-2.5">{fmtDate(a.date)}</td>
                      <td className="p-2.5">
                        <Badge variant={a.status === "present" ? "success" : a.status === "late" ? "warning" : a.status === "excused" ? "secondary" : "danger"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-muted-foreground">{a.note ?? ""}</td>
                    </tr>
                  ))}
                  {profile.attendance.records.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No attendance recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* â”€â”€ Library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === "library" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Current Borrowings</CardTitle>
            </CardHeader>
            <CardContent>
              {activeBorrowings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No books currently borrowed.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Book</th>
                        <th className="text-left p-2.5 font-medium">Borrowed</th>
                        <th className="text-left p-2.5 font-medium">Due</th>
                        <th className="text-left p-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBorrowings.map((b) => (
                        <tr key={b._id} className="border-t border-border">
                          <td className="p-2.5 font-medium">{b.bookName}</td>
                          <td className="p-2.5 text-muted-foreground">{fmtDate(b.borrowedAt)}</td>
                          <td className="p-2.5 text-muted-foreground">{fmtDate(b.dueDate)}</td>
                          <td className="p-2.5">
                            <Badge variant={b.dueDate < now ? "danger" : "warning"}>
                              {b.dueDate < now ? `Overdue ${Math.floor((now - b.dueDate) / 86400000)}d` : "On time"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Borrowing History</CardTitle>
            </CardHeader>
            <CardContent>
              {profile.borrowings.filter((b) => b.status === "returned").length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No returned books yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Book</th>
                        <th className="text-left p-2.5 font-medium">Borrowed</th>
                        <th className="text-left p-2.5 font-medium">Returned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.borrowings.filter((b) => b.status === "returned").slice(0, 20).map((b) => (
                        <tr key={b._id} className="border-t border-border">
                          <td className="p-2.5 font-medium">{b.bookName}</td>
                          <td className="p-2.5 text-muted-foreground">{fmtDate(b.borrowedAt)}</td>
                          <td className="p-2.5 text-muted-foreground">{fmtDate(b.returnedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fines</CardTitle>
            </CardHeader>
            <CardContent>
              {profile.fines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No fines.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/5">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Reason</th>
                        <th className="text-right p-2.5 font-medium">Amount</th>
                        <th className="text-right p-2.5 font-medium">Balance</th>
                        <th className="text-left p-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.fines.map((f) => (
                        <tr key={f._id} className="border-t border-border">
                          <td className="p-2.5 capitalize">{f.reason}</td>
                          <td className="p-2.5 text-right">KES {f.amount.toLocaleString("en-KE")}</td>
                          <td className="p-2.5 text-right font-semibold">KES {(f.outstanding ?? 0).toLocaleString("en-KE")}</td>
                          <td className="p-2.5">
                            <Badge variant={f.status === "paid" ? "success" : f.status === "waived" ? "secondary" : "danger"}>
                              {f.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* â”€â”€ Fees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {tab === "fees" && (
        <FeesTab studentId={s._id} fees={profile.fees} isLeadership={isLeadership} />
      )}

      {/* ── EAV Modules (Student 360°) ─────────────────────────────── */}
      {tab === "modules" && (
        <div className="space-y-4">
          {eavData === undefined && (
            <div className="flex items-center justify-center p-12">
              <BrandLoader variant="book" size="md" />
            </div>
          )}

          {eavData === null && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg">Student not found</h3>
              </CardContent>
            </Card>
          )}

          {eavData && eavData.modules.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg">No EAV Modules Configured</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  No learner modules are enabled yet. Enable modules in Settings to start
                  recording extended student data (health, counseling, transport, etc.).
                </p>
              </CardContent>
            </Card>
          )}

          {eavData && eavData.modules.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1 space-y-1">
                {eavData.modules.map((mod) => (
                  <button
                    key={mod.moduleId}
                    onClick={() => setActiveModule(mod.moduleId)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                      activeModule === mod.moduleId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{mod.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </div>
                    {mod.description && (
                      <p className="text-xs opacity-70 mt-0.5 truncate">{mod.description}</p>
                    )}
                  </button>
                ))}
                {isLeadership && (
                  <Link
                    href="/dashboard/settings"
                    className="block px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                    Edit structure
                  </Link>
                )}
              </div>

              <div className="lg:col-span-3">
                {activeModule ? (
                  (() => {
                    const mod = eavData.modules.find((m) => m.moduleId === activeModule);
                    if (!mod) return null;
                    return (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>{mod.name}</span>
                            {eavDirty && isLeadership && (
                              <Button
                                onClick={handleEavSave}
                                disabled={eavSaving}
                                size="sm"
                              >
                                {eavSaving ? (
                                  <BrandLoader variant="dots" size="sm" className="mr-2" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Save
                              </Button>
                            )}
                          </CardTitle>
                          {mod.description && (
                            <CardDescription>{mod.description}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent>
                          <ModuleRendererInline
                            module={mod}
                            values={eavForm}
                            onChange={
                              isLeadership
                                ? (fieldId, value) => {
                                    setEavForm((f) => ({ ...f, [fieldId]: value }));
                                    setEavDirty(true);
                                  }
                                : undefined
                            }
                            readOnly={!isLeadership}
                          />
                        </CardContent>
                      </Card>
                    );
                  })()
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="p-10 text-center">
                      <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Select a module from the left to view its data.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ Edit modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Student" size="lg">
        <form onSubmit={handleSave} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">School Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input value={form.firstName ?? ""} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input value={form.lastName ?? ""} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
              </div>
              <div>
                <Label>Admission Number *</Label>
                <Input value={form.admNo ?? ""} onChange={(e) => setForm((f) => ({ ...f, admNo: e.target.value }))} required />
              </div>
              <div>
                <Label>Class *</Label>
                <Select
                  value={form.classId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value, streamId: "" }))}
                  required
                >
                  <option value="">Select a class</option>
                  {classes?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </Select>
              </div>
              {classes?.find((c) => c._id === form.classId)?.hasStreams && (
                <div>
                  <Label>Stream</Label>
                  <Select value={form.streamId ?? ""} onChange={(e) => setForm((f) => ({ ...f, streamId: e.target.value }))}>
                    <option value="">Select a stream</option>
                    {streamsQuery?.map((st) => <option key={st._id} value={st._id}>{st.name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label>Status</Label>
                <Select value={form.status ?? "active"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="graduated">Graduated</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground border-t pt-3">
            Gender, date of birth and admission date are school-defined fields — edit them in the
            EAV Modules tab. Parent / guardian contact is managed on the Guardians page.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * Inline module renderer for the Student 360° EAV tab.
 * Renders a single module's sections and fields using pre-fetched data.
 */
function ModuleRendererInline({
  module,
  values = {},
  onChange,
  readOnly = false,
}: {
  module: {
    moduleId: string;
    name: string;
    description?: string;
    sections: Array<{
      sectionId: string;
      name: string;
      description?: string;
      isRepeatable: boolean;
      isSensitive: boolean;
      fields: Array<{
        fieldId: string;
        name: string;
        inputType: string;
        isRequired: boolean;
        isSensitive: boolean;
        options?: string[];
        value: string;
      }>;
    }>;
  };
  values?: Record<string, string>;
  onChange?: (fieldId: string, value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      {module.sections.map((sec) => (
        <div key={sec.sectionId} className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            {sec.name}
            {sec.isRepeatable && <Badge variant="secondary" className="text-xs">Repeatable</Badge>}
            {sec.isSensitive && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Sensitive</Badge>
            )}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec.fields.map((field) => (
              <div
                key={field.fieldId}
                className={
                  field.inputType === "text_long" || field.inputType === "dropdown_multi"
                    ? "md:col-span-2"
                    : ""
                }
              >
                <FieldRenderer
                  name={field.name}
                  inputType={field.inputType}
                  value={values[field.fieldId] ?? field.value ?? ""}
                  options={field.options}
                  isRequired={field.isRequired}
                  onChange={
                    readOnly || field.isSensitive
                      ? undefined
                      : (v) => onChange?.(field.fieldId, v)
                  }
                  readOnly={readOnly || field.isSensitive}
                  isSensitive={field.isSensitive}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {module.sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">
          No sections configured for this module.
        </p>
      )}
    </div>
  );
}

