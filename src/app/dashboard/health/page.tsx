"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Heart, Stethoscope, MessageSquare, Search, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

type Tab = "clinic" | "counseling" | "records";
const TABS: { key: Tab; label: string; icon: typeof Heart }[] = [
  { key: "clinic", label: "Clinic Visits", icon: Stethoscope },
  { key: "counseling", label: "Counseling", icon: MessageSquare },
  { key: "records", label: "Health Records", icon: Heart },
];

export default function HealthPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [tab, setTab] = useState<Tab>("clinic");
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const clinicVisits = useQuery(
    api.health.listClinicVisitsBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const filteredStudents = students?.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.admNo.toLowerCase().includes(q);
  });

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Health & Welfare</h1>
          <p className="text-muted-foreground text-sm">
            Manage student health records, clinic visits, and counseling
          </p>
        </div>
      </div>

      {/* Student search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student by name or admission number..."
                className="pl-10"
              />
            </div>
          </div>
          {filteredStudents && filteredStudents.length > 0 && search.trim() && (
            <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg">
              {filteredStudents.slice(0, 10).map((s) => (
                <button
                  key={s._id}
                  onClick={() => {
                    setSelectedStudentId(s._id);
                    setSearch(`${s.firstName} ${s.lastName}`);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors flex items-center justify-between border-b border-border last:border-0"
                >
                  <div>
                    <span className="font-medium">{s.firstName} {s.lastName}</span>
                    <span className="text-muted-foreground text-sm ml-2">({s.admNo})</span>
                  </div>
                  <Badge variant="secondary">{s.status ?? "active"}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "clinic" && (
        <ClinicTab schoolId={school._id} visits={clinicVisits} isLeadership={isLeadership} />
      )}
      {tab === "counseling" && selectedStudentId && (
        <CounselingTab studentId={selectedStudentId} schoolId={school._id} isLeadership={isLeadership} />
      )}
      {tab === "counseling" && !selectedStudentId && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Select a student above to view counseling notes</p>
          </CardContent>
        </Card>
      )}
      {tab === "records" && selectedStudentId && (
        <HealthRecordTab studentId={selectedStudentId} schoolId={school._id} isLeadership={isLeadership} />
      )}
      {tab === "records" && !selectedStudentId && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground">
            <Heart className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Select a student above to view their health record</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// â”€â”€ Clinic Visits Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ClinicTab({
  schoolId,
  visits,
  isLeadership,
}: {
  schoolId: string;
  visits: Array<{
    _id: string;
    studentId: string;
    date: number;
    reason?: string;
    action?: string;
    followUp?: string;
    recordedBy?: string;
    studentName?: string;
  }> | undefined;
  isLeadership: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Recent Clinic Visits</h3>
        {isLeadership && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Record Visit
          </Button>
        )}
      </div>

      {visits === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : visits.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No clinic visits recorded yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-2.5 font-medium">Date</th>
                <th className="text-left p-2.5 font-medium">Reason</th>
                <th className="text-left p-2.5 font-medium">Action Taken</th>
                <th className="text-left p-2.5 font-medium">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v._id} className="border-t border-border">
                  <td className="p-2.5 text-muted-foreground">{formatDate(v.date)}</td>
                  <td className="p-2.5 font-medium">{v.reason}</td>
                  <td className="p-2.5">{v.action}</td>
                  <td className="p-2.5 text-muted-foreground">{v.followUp ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Counseling Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CounselingTab({
  studentId,
  schoolId,
  isLeadership,
}: {
  studentId: string;
  schoolId: string;
  isLeadership: boolean;
}) {
  const notes = useQuery(api.health.listCounselingNotes, { studentId: studentId as any });
  const createNote = useMutation(api.health.createCounselingNote);
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState("");
  const [notesText, setNotesText] = useState("");
  const [isConfidential, setIsConfidential] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !notesText.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createNote({
        schoolId: schoolId as any,
        studentId: studentId as any,
        date: new Date(date).getTime(),
        notes: notesText.trim(),
        isConfidential,
      });
      toast.success("Counseling note added");
      setShowAdd(false);
      setDate("");
      setNotesText("");
      setIsConfidential(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Counseling Notes</h3>
        {isLeadership && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Note
          </Button>
        )}
      </div>

      {notes === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : notes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No counseling notes for this student.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Card key={n._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{formatDate(n.date)}</span>
                  {n.isConfidential && (
                    <Badge variant="warning" className="text-xs">Confidential</Badge>
                  )}
                </div>
                <p className="text-sm">{n.notes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Counseling Note">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label>Notes *</Label>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              className="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isConfidential}
              onChange={(e) => setIsConfidential(e.target.checked)}
              className="rounded"
            />
            <Label className="text-sm">Mark as confidential</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Save Note</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// â”€â”€ Health Record Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HealthRecordTab({
  studentId,
  schoolId,
  isLeadership,
}: {
  studentId: string;
  schoolId: string;
  isLeadership: boolean;
}) {
  const record = useQuery(api.health.getHealthRecord, { studentId: studentId as any });
  const upsertRecord = useMutation(api.health.upsertHealthRecord);
  const [editing, setEditing] = useState(false);
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upsertRecord({
        schoolId: schoolId as any,
        studentId: studentId as any,
        bloodType: bloodType || undefined,
        allergies: allergies ? allergies.split(",").map((s) => s.trim()) : undefined,
        conditions: conditions ? conditions.split(",").map((s) => s.trim()) : undefined,
        medications: medications ? medications.split(",").map((s) => s.trim()) : undefined,
        insuranceInfo: insuranceInfo || undefined,
        notes: notes || undefined,
      });
      toast.success("Health record saved");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (record === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  if (editing || !record) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{record ? "Edit" : "Create"} Health Record</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Blood Type</Label>
                <Select
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                >
                  <option value="">Select</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </Select>
              </div>
              <div>
                <Label>Insurance Info</Label>
                <Input
                  value={insuranceInfo}
                  onChange={(e) => setInsuranceInfo(e.target.value)}
                  placeholder="NHIF, private, etc."
                />
              </div>
            </div>
            <div>
              <Label>Allergies (comma-separated)</Label>
              <Input
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="e.g. Peanuts, Penicillin"
              />
            </div>
            <div>
              <Label>Conditions (comma-separated)</Label>
              <Input
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="e.g. Asthma, Diabetes"
              />
            </div>
            <div>
              <Label>Medications (comma-separated)</Label>
              <Input
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                placeholder="e.g. Inhaler, Insulin"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              {record && (
                <Button variant="outline" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Health Record</CardTitle>
        {isLeadership && (
          <Button variant="outline" size="sm" onClick={() => {
            setBloodType(record.bloodType ?? "");
            setAllergies(record.allergies?.join(", ") ?? "");
            setConditions(record.conditions?.join(", ") ?? "");
            setMedications(record.medications?.join(", ") ?? "");
            setInsuranceInfo(record.insuranceInfo ?? "");
            setNotes(record.notes ?? "");
            setEditing(true);
          }}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Blood Type</p>
            <p className="font-semibold">{record.bloodType ?? ""}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Insurance</p>
            <p className="font-semibold">{record.insuranceInfo ?? ""}</p>
          </div>
        </div>
        {record.allergies && record.allergies.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-1">Allergies</p>
            <div className="flex flex-wrap gap-1">
              {record.allergies.map((a, i) => (
                <Badge key={i} variant="danger">{a}</Badge>
              ))}
            </div>
          </div>
        )}
        {record.conditions && record.conditions.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-1">Conditions</p>
            <div className="flex flex-wrap gap-1">
              {record.conditions.map((c, i) => (
                <Badge key={i} variant="warning">{c}</Badge>
              ))}
            </div>
          </div>
        )}
        {record.medications && record.medications.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-1">Medications</p>
            <div className="flex flex-wrap gap-1">
              {record.medications.map((m, i) => (
                <Badge key={i} variant="secondary">{m}</Badge>
              ))}
            </div>
          </div>
        )}
        {record.notes && (
          <div>
            <p className="text-sm text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{record.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

