"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Search, ArrowLeft, UserPlus } from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  under_review: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  waitlisted: "bg-purple-100 text-purple-800",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  accepted: "Accepted",
  rejected: "Rejected",
  waitlisted: "Waitlisted",
};

const emptyForm = {
  applicantName: "",
  dateOfBirth: "",
  gender: "male" as "male" | "female" | "other",
  previousSchool: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  desiredClassId: "",
  notes: "",
};

export default function AdmissionsPage() {
  const school = useSchool();
  const searchParams = useSearchParams();
  const router = useRouter();
  const section = searchParams.get("section");
  const intakeMode = !!section && section.toLowerCase().includes("intake");

  const applications = useQuery(
    api.admissions.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.admissions.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const classes = useQuery(
    api.classes.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const createApplication = useMutation(api.admissions.create);
  const updateStatus = useMutation(api.admissions.updateStatus);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!form.applicantName.trim()) {
      toast.error("Enter the applicant name");
      return;
    }
    if (!form.dateOfBirth) {
      toast.error("Select the applicant's date of birth");
      return;
    }
    if (!form.guardianName.trim() || !form.guardianPhone.trim()) {
      toast.error("Guardian name and phone are required");
      return;
    }
    if (!form.desiredClassId) {
      toast.error("Select the desired class");
      return;
    }
    setSaving(true);
    try {
      await createApplication({
        schoolId: school._id,
        applicantName: form.applicantName.trim(),
        dateOfBirth: new Date(form.dateOfBirth).getTime(),
        gender: form.gender,
        previousSchool: form.previousSchool.trim() || undefined,
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        guardianEmail: form.guardianEmail.trim() || undefined,
        desiredClassId: form.desiredClassId as any,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Application submitted");
      setShowAdd(false);
      if (intakeMode) router.replace("/dashboard/admissions");
      setForm(emptyForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setSaving(false);
    }
  };

  const filteredApps = applications?.filter(
    (a) => statusFilter === "all" || a.status === statusFilter
  );

  // Full-page intake form when navigated via the sidebar "Intake Form" section.
  if (intakeMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admissions Intake Form</h1>
            <p className="text-muted-foreground text-sm">
              Register a new applicant. Intake creates the learner record pipeline.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.replace("/dashboard/admissions")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Applications
          </Button>
        </div>
        <IntakeForm
          schoolId={school._id}
          classes={classes ?? []}
          form={form}
          setForm={setForm}
          saving={saving}
          onSubmit={handleSubmit}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admissions</h1>
          <p className="text-muted-foreground text-sm">
            Track applications from intake through review and acceptance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard/admissions?section=intake")}>
            <ClipboardList className="h-4 w-4 mr-1.5" /> Intake Form
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> New Application
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending ?? 0}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats?.underReview ?? 0}</div>
            <div className="text-sm text-muted-foreground">Under Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.accepted ?? 0}</div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats?.rejected ?? 0}</div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
      </div>

      {/* Applications Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Applications</CardTitle>
            <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
              {["all", "pending", "under_review", "accepted", "rejected", "waitlisted"].map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f === "all" ? "All" : STATUS_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {applications === undefined ? (
            <div className="flex items-center justify-center p-8">
              <BrandLoader variant="book" size="md" />
            </div>
          ) : filteredApps && filteredApps.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              <Search className="h-6 w-6 mx-auto mb-2 opacity-40" />
              {applications.length === 0 ? "No applications yet — start with the Intake Form." : "No applications match this status."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Applicant</th>
                    <th className="text-left py-2">Desired Class</th>
                    <th className="text-left py-2">Guardian</th>
                    <th className="text-left py-2">Phone</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps?.map((app) => (
                    <tr key={app._id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">{app.applicantName}</td>
                      <td className="py-2">
                        {classes?.find((c) => c._id === app.desiredClassId)?.name ?? "—"}
                      </td>
                      <td className="py-2">{app.guardianName}</td>
                      <td className="py-2">{app.guardianPhone}</td>
                      <td className="py-2">{new Date(app.applicationDate).toLocaleDateString("en-KE")}</td>
                      <td className="py-2">
                        <Badge className={statusColors[app.status]}>{STATUS_LABELS[app.status] ?? app.status}</Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1 flex-wrap">
                          {app.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus({ id: app._id, status: "under_review" })}
                            >
                              Review
                            </Button>
                          )}
                          {(app.status === "pending" || app.status === "under_review") && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => updateStatus({ id: app._id, status: "accepted" })}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => updateStatus({ id: app._id, status: "rejected" })}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {app.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus({ id: app._id, status: "waitlisted" })}
                            >
                              Waitlist
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Application Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Admission Application">
        <IntakeForm
          schoolId={school._id}
          classes={classes ?? []}
          form={form}
          setForm={setForm}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>
    </div>
  );
}

function IntakeForm({
  schoolId,
  classes,
  form,
  setForm,
  saving,
  onSubmit,
  onCancel,
}: {
  schoolId: string;
  classes: Array<{ _id: string; name: string; hasStreams: boolean }>;
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  saving: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  void schoolId;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Applicant Name *</Label>
          <Input
            value={form.applicantName}
            onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
            placeholder="Full name"
          />
        </div>
        <div>
          <Label>Date of Birth *</Label>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
          />
        </div>
        <div>
          <Label>Gender *</Label>
          <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as any })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div>
          <Label>Desired Class *</Label>
          <Select
            value={form.desiredClassId}
            onChange={(e) => setForm({ ...form, desiredClassId: e.target.value })}
          >
            <option value="">Select a class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Previous School</Label>
          <Input
            value={form.previousSchool}
            onChange={(e) => setForm({ ...form, previousSchool: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <div>
          <Label>Guardian Name *</Label>
          <Input
            value={form.guardianName}
            onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
            placeholder="Parent / guardian full name"
          />
        </div>
        <div>
          <Label>Guardian Phone *</Label>
          <Input
            value={form.guardianPhone}
            onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
            placeholder="07xx xxx xxx"
          />
        </div>
        <div>
          <Label>Guardian Email</Label>
          <Input
            type="email"
            value={form.guardianEmail}
            onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <textarea
            className="w-full border rounded px-3 py-2 min-h-[90px]"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Siblings already enrolled, special considerations, etc."
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={onSubmit} disabled={saving}>
          {saving && <BrandLoader variant="dots" size="sm" className="mr-2" />}
          Submit Application
        </Button>
      </div>
    </div>
  );
}
