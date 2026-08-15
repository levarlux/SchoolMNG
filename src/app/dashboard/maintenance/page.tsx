"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Wrench, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

const PRIORITY_CONFIG: Record<string, { label: string; variant: string }> = {
  low: { label: "Low", variant: "secondary" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "danger" },
  urgent: { label: "Urgent", variant: "destructive" },
};

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: typeof Clock }> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  in_progress: { label: "In Progress", variant: "default", icon: Wrench },
  completed: { label: "Completed", variant: "success", icon: CheckCircle2 },
};

export default function MaintenancePage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [showAdd, setShowAdd] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const tasks = useQuery(
    api.maintenance.listBySchool,
    school && statusFilter !== "all"
      ? { schoolId: school._id, status: statusFilter as any }
      : school
      ? { schoolId: school._id }
      : "skip"
  );

  const createTask = useMutation(api.maintenance.create);
  const updateStatus = useMutation(api.maintenance.updateStatus);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [priority, setPriority] = useState("medium");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !title.trim() || !location.trim()) return;
    try {
      await createTask({
        schoolId: school._id,
        title: title.trim(),
        description: description || undefined,
        location: location.trim(),
        priority: priority as any,
      });
      toast.success("Task created");
      setShowAdd(false);
      setTitle("");
      setDescription("");
      setLocation("");
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
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <p className="text-muted-foreground text-sm">Facility maintenance tasks and issues</p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Task
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "in_progress", "completed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
      </div>

      {tasks === undefined ? (
        <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-8 text-center text-muted-foreground text-sm"><Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />No maintenance tasks.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const statusConfig = STATUS_CONFIG[t.status];
            const priorityConfig = PRIORITY_CONFIG[t.priority];
            return (
              <Card key={t._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={statusConfig?.variant as any}>{statusConfig?.label}</Badge>
                        <Badge variant={priorityConfig?.variant as any}>{priorityConfig?.label}</Badge>
                        <span className="text-xs text-muted-foreground">{t.location}</span>
                      </div>
                      <h3 className="font-medium">{t.title}</h3>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                    </div>
                    {isLeadership && t.status !== "completed" && (
                      <div className="flex gap-1">
                        {t.status === "pending" && (
                          <Button variant="outline" size="sm" onClick={async () => {
                            try { await updateStatus({ id: t._id, status: "in_progress" }); toast.success("Updated"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                          }}>
                            Start
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-green-600" onClick={async () => {
                          try { await updateStatus({ id: t._id, status: "completed" }); toast.success("Completed"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}>
                          Complete
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Maintenance Task">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Fix broken window in Block A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location *</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} required placeholder="e.g. Block A, Room 5" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

