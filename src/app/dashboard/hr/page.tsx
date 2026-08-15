"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Briefcase, CheckCircle2, XCircle, Clock, Star } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

const LEAVE_TYPES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "compassionate", label: "Compassionate Leave" },
  { value: "study", label: "Study Leave" },
  { value: "other", label: "Other" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  denied: { label: "Denied", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export default function HRPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [tab, setTab] = useState<"leave" | "appraisals">("leave");
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [showAddAppraisal, setShowAddAppraisal] = useState(false);

  const leaveRequests = useQuery(
    api.hr.listLeaveBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const appraisals = useQuery(
    api.hr.listAppraisalsBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const teachers = useQuery(
    api.teachers.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createLeave = useMutation(api.hr.createLeaveRequest);
  const approveLeave = useMutation(api.hr.approveLeave);
  const denyLeave = useMutation(api.hr.denyLeave);
  const createAppraisal = useMutation(api.hr.createAppraisal);

  // Leave form
  const [leaveTeacherId, setLeaveTeacherId] = useState("");
  const [leaveType, setLeaveType] = useState("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Appraisal form
  const [appraisalTeacherId, setAppraisalTeacherId] = useState("");
  const [appraisalDate, setAppraisalDate] = useState("");
  const [rating, setRating] = useState("3");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [goals, setGoals] = useState("");

  async function handleCreateLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !leaveTeacherId || !leaveStart || !leaveEnd || !leaveReason.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createLeave({
        schoolId: school._id,
        teacherId: leaveTeacherId as any,
        leaveType: leaveType as any,
        startDate: new Date(leaveStart).getTime(),
        endDate: new Date(leaveEnd).getTime(),
        reason: leaveReason.trim(),
      });
      toast.success("Leave request submitted");
      setShowAddLeave(false);
      setLeaveReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleCreateAppraisal(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !appraisalTeacherId || !appraisalDate) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createAppraisal({
        schoolId: school._id,
        teacherId: appraisalTeacherId as any,
        reviewDate: new Date(appraisalDate).getTime(),
        rating: parseInt(rating),
        strengths: strengths || undefined,
        improvements: improvements || undefined,
        goals: goals || undefined,
      });
      toast.success("Appraisal recorded");
      setShowAddAppraisal(false);
      setStrengths("");
      setImprovements("");
      setGoals("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

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
          <h1 className="text-2xl font-bold">HR & Leave</h1>
          <p className="text-muted-foreground text-sm">Leave requests and staff appraisals</p>
        </div>
        {isLeadership && (
          <Button
            onClick={() => tab === "leave" ? setShowAddLeave(true) : setShowAddAppraisal(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {tab === "leave" ? "New Leave Request" : "New Appraisal"}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["leave", "appraisals"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "leave" ? "Leave Requests" : "Appraisals"}
          </button>
        ))}
      </div>

      {/* Leave Requests */}
      {tab === "leave" && (
        <div className="space-y-3">
          {leaveRequests === undefined ? (
            <div className="flex items-center justify-center p-8">
              <BrandLoader variant="book" size="md" />
            </div>
          ) : leaveRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No leave requests yet.
              </CardContent>
            </Card>
          ) : (
            leaveRequests.map((lr) => {
              const config = STATUS_CONFIG[lr.status];
              return (
                <Card key={lr._id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={config?.variant as any}>{config?.label}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {LEAVE_TYPES.find((t) => t.value === lr.leaveType)?.label}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{lr.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(lr.startDate)} — {formatDate(lr.endDate)}
                        </p>
                      </div>
                      {isLeadership && lr.status === "pending" && (
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600"
                            onClick={async () => {
                              try { await approveLeave({ id: lr._id }); toast.success("Approved"); } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600"
                            onClick={async () => {
                              try { await denyLeave({ id: lr._id }); toast.success("Denied"); } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Deny
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Appraisals */}
      {tab === "appraisals" && (
        <div className="space-y-3">
          {appraisals === undefined ? (
            <div className="flex items-center justify-center p-8">
              <BrandLoader variant="book" size="md" />
            </div>
          ) : appraisals.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No appraisals recorded yet.
              </CardContent>
            </Card>
          ) : (
            appraisals.map((a) => (
              <Card key={a._id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Rating:</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < a.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(a.reviewDate)}</span>
                  </div>
                  {a.strengths && (
                    <p className="text-sm"><strong className="text-green-600">Strengths:</strong> {a.strengths}</p>
                  )}
                  {a.improvements && (
                    <p className="text-sm"><strong className="text-orange-600">Improvements:</strong> {a.improvements}</p>
                  )}
                  {a.goals && (
                    <p className="text-sm"><strong className="text-blue-600">Goals:</strong> {a.goals}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Leave modal */}
      <Modal open={showAddLeave} onClose={() => setShowAddLeave(false)} title="New Leave Request">
        <form onSubmit={handleCreateLeave} className="space-y-4">
          <div>
            <Label>Teacher *</Label>
            <Select value={leaveTeacherId} onChange={(e) => setLeaveTeacherId(e.target.value)} required>
              <option value="">Select teacher</option>
              {teachers?.map((t) => (
                <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Leave Type *</Label>
              <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {LEAVE_TYPES.map((lt) => (
                  <option key={lt.value} value={lt.value}>{lt.label}</option>
                ))}
              </Select>
            </div>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date *</Label>
              <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} required />
            </div>
            <div>
              <Label>End Date *</Label>
              <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Reason *</Label>
            <textarea
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAddLeave(false)}>Cancel</Button>
            <Button type="submit">Submit Request</Button>
          </div>
        </form>
      </Modal>

      {/* Appraisal modal */}
      <Modal open={showAddAppraisal} onClose={() => setShowAddAppraisal(false)} title="New Appraisal">
        <form onSubmit={handleCreateAppraisal} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Teacher *</Label>
              <Select value={appraisalTeacherId} onChange={(e) => setAppraisalTeacherId(e.target.value)} required>
                <option value="">Select teacher</option>
                {teachers?.map((t) => (
                  <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Review Date *</Label>
              <Input type="date" value={appraisalDate} onChange={(e) => setAppraisalDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Rating (1-5) *</Label>
            <Select value={rating} onChange={(e) => setRating(e.target.value)}>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>{r} - {r === 1 ? "Needs Improvement" : r === 2 ? "Below Expectations" : r === 3 ? "Meets Expectations" : r === 4 ? "Exceeds Expectations" : "Outstanding"}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Strengths</Label>
            <Input value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Key strengths observed" />
          </div>
          <div>
            <Label>Areas for Improvement</Label>
            <Input value={improvements} onChange={(e) => setImprovements(e.target.value)} placeholder="Areas to develop" />
          </div>
          <div>
            <Label>Goals</Label>
            <Input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Goals for next period" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAddAppraisal(false)}>Cancel</Button>
            <Button type="submit">Save Appraisal</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

