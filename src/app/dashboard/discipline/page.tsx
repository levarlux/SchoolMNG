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
import { Plus, ShieldAlert, Search, CheckCircle2, Clock, AlertTriangle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", variant: "danger", icon: AlertTriangle },
  investigating: { label: "Investigating", variant: "warning", icon: Clock },
  resolved: { label: "Resolved", variant: "success", icon: CheckCircle2 },
  escalated: { label: "Escalated", variant: "destructive", icon: ArrowUpCircle },
};

const CATEGORIES = [
  "uniform", "conduct", "academic", "bullying", "attendance", "property_damage", "other",
];

export default function DisciplinePage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const incidents = useQuery(
    api.discipline.listBySchool,
    school && statusFilter !== "all"
      ? { schoolId: school._id, status: statusFilter as any }
      : school
      ? { schoolId: school._id }
      : "skip"
  );

  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createIncident = useMutation(api.discipline.create);
  const updateStatus = useMutation(api.discipline.updateStatus);

  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("conduct");
  const [actionTaken, setActionTaken] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !studentId || !date || !description.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createIncident({
        schoolId: school._id,
        studentId: studentId as any,
        date: new Date(date).getTime(),
        description: description.trim(),
        category,
        actionTaken: actionTaken || undefined,
      });
      toast.success("Incident recorded");
      setShowAdd(false);
      setStudentId("");
      setDate("");
      setDescription("");
      setActionTaken("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleStatusChange(incidentId: string, newStatus: string) {
    try {
      await updateStatus({ id: incidentId as any, resolutionStatus: newStatus as any });
      toast.success("Status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  const filteredIncidents = incidents?.filter((inc) => {
    if (!search.trim()) return true;
    return inc.description.toLowerCase().includes(search.toLowerCase());
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
          <h1 className="text-2xl font-bold">Discipline</h1>
          <p className="text-muted-foreground text-sm">
            Track and manage student conduct incidents
          </p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Record Incident
          </Button>
        )}
      </div>

      {/* Stats */}
      {incidents && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => {
            const count = incidents.filter((i) => i.resolutionStatus === key).length;
            const Icon = config.icon;
            return (
              <Card key={key}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className={`h-5 w-5 text-${config.variant === "success" ? "green-600" : config.variant === "warning" ? "yellow-600" : config.variant === "danger" ? "red-600" : "red-700"}`} />
                  <div>
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incidents..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </Select>
      </div>

      {/* Incidents list */}
      {incidents === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : filteredIncidents?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-50" />
            {incidents.length === 0 ? "No incidents recorded yet." : "No incidents match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIncidents?.map((inc) => {
            const statusConfig = STATUS_CONFIG[inc.resolutionStatus];
            return (
              <Card key={inc._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusConfig.variant as any}>{statusConfig.label}</Badge>
                        <Badge variant="secondary">{inc.category}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(inc.date)}</span>
                      </div>
                      <p className="text-sm mt-2">{inc.description}</p>
                      {inc.actionTaken && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Action:</strong> {inc.actionTaken}
                        </p>
                      )}
                    </div>
                    {isLeadership && inc.resolutionStatus !== "resolved" && (
                      <div className="flex gap-1">
                        {inc.resolutionStatus === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(inc._id, "investigating")}
                          >
                            Investigate
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(inc._id, "resolved")}
                          className="text-green-600"
                        >
                          Resolve
                        </Button>
                        {inc.resolutionStatus !== "escalated" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(inc._id, "escalated")}
                            className="text-red-600"
                          >
                            Escalate
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add incident modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Record Discipline Incident">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Student *</Label>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Select student</option>
              {students?.map((s) => (
                <option key={s._id} value={s._id}>{s.firstName} {s.lastName} ({s.admNo})</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Description *</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <Label>Action Taken</Label>
            <Input
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="e.g. Warning given, parents contacted"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Record Incident</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

