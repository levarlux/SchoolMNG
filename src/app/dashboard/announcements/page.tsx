"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { Megaphone, Plus, AlertTriangle, Info, PartyPopper, Trash2, Clock } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

const priorities = ["low", "normal", "high", "urgent"] as const;
const audiences = ["all", "staff_only", "teachers_only", "parents_only", "students_only"] as const;

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  normal: "bg-blue-100 text-blue-800",
  high: "bg-yellow-100 text-yellow-800",
  urgent: "bg-red-100 text-red-800",
};

const audienceLabels: Record<string, string> = {
  all: "Everyone",
  staff_only: "Staff Only",
  teachers_only: "Teachers Only",
  parents_only: "Parents Only",
  students_only: "Students Only",
};

export default function AnnouncementsPage() {
  const school = useSchool();
  const announcements = useQuery(
    api.announcements.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.announcements.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createAnnouncement = useMutation(api.announcements.create);
  const removeAnnouncement = useMutation(api.announcements.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal" as typeof priorities[number],
    targetAudience: "all" as typeof audiences[number],
    expiresAt: "",
  });

  const handleCreate = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    await createAnnouncement({
      schoolId: school!._id,
      title: form.title.trim(),
      content: form.content.trim(),
      priority: form.priority,
      targetAudience: form.targetAudience,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : undefined,
    });
    toast.success("Announcement published");
    setModalOpen(false);
    setForm({ title: "", content: "", priority: "normal", targetAudience: "all", expiresAt: "" });
  };

  const handleDelete = async (id: Id<"announcements">) => {
    if (!confirm("Delete this announcement?")) return;
    await removeAnnouncement({ id });
    toast.success("Announcement deleted");
  };

  if (!school) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Announcements</h1>
            <p className="text-muted-foreground text-sm">
              School-wide announcements and notifications
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Announcement
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.active ?? 0}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.expired ?? 0}</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.urgent ?? 0}</p>
            <p className="text-xs text-muted-foreground">Urgent</p>
          </CardContent>
        </Card>
      </div>

      {/* Announcements List */}
      <div className="space-y-3">
        {!announcements || announcements.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No announcements</p>
            </CardContent>
          </Card>
        ) : (
          announcements.map((ann) => {
            const isExpired = ann.expiresAt && ann.expiresAt < Date.now();
            return (
              <Card key={ann._id} className={isExpired ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3 flex-1">
                      <div className="mt-0.5">
                        {ann.priority === "urgent" ? (
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        ) : ann.priority === "high" ? (
                          <Megaphone className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <Info className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{ann.title}</h3>
                          <Badge className={priorityColors[ann.priority] || ""}>{ann.priority}</Badge>
                          <Badge variant="outline">{audienceLabels[ann.targetAudience] || ann.targetAudience}</Badge>
                          {!ann.isPublished && <Badge variant="secondary">Draft</Badge>}
                          {isExpired && <Badge variant="secondary">Expired</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{ann.content}</p>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(ann.createdAt).toLocaleDateString()}
                          </span>
                          {ann.expiresAt && (
                            <span>Expires: {new Date(ann.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(ann._id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Announcement title"
            />
          </div>
          <div>
            <Label>Content *</Label>
            <textarea
              className="w-full border border-border rounded-md p-2 bg-background text-sm min-h-[120px]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Announcement content"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as typeof priorities[number] })}
              >
                {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label>Audience</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-sm"
                value={form.targetAudience}
                onChange={(e) => setForm({ ...form, targetAudience: e.target.value as typeof audiences[number] })}
              >
                {audiences.map((a) => <option key={a} value={a}>{audienceLabels[a] || a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Expires On (optional)</Label>
            <Input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Publish</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
