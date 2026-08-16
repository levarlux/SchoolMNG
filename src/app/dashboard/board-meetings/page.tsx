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
import { ClipboardList, Plus, Calendar, Users, Trash2 } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function BoardMeetingsPage() {
  const school = useSchool();
  const meetings = useQuery(
    api.boardMeetings.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.boardMeetings.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createMeeting = useMutation(api.boardMeetings.create);
  const updateMeeting = useMutation(api.boardMeetings.update);
  const removeMeeting = useMutation(api.boardMeetings.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    scheduledDate: "",
    attendees: "",
    summary: "",
    actionItems: "",
  });

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.scheduledDate) {
      toast.error("Date is required");
      return;
    }
    await createMeeting({
      schoolId: school!._id,
      title: form.title.trim(),
      date: new Date(form.scheduledDate).getTime(),
      attendees: form.attendees.trim() ? form.attendees.split(",").map((a) => a.trim()) : [],
      summary: form.summary.trim() || undefined,
      actionItems: form.actionItems.trim() ? form.actionItems.split("\n").filter(Boolean) : undefined,
    });
    toast.success("Meeting created");
    setModalOpen(false);
    setForm({ title: "", scheduledDate: "", attendees: "", summary: "", actionItems: "" });
  };

  const handleStatusUpdate = async (id: Id<"board_meetings">, status: "completed" | "cancelled") => {
    await updateMeeting({ id, status });
    toast.success(`Meeting ${status}`);
  };

  const handleDelete = async (id: Id<"board_meetings">) => {
    if (!confirm("Delete this meeting record?")) return;
    await removeMeeting({ id });
    toast.success("Meeting deleted");
  };

  if (!school) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const upcoming = stats?.upcoming ?? [];

  return (
    <EavRouteWrapper moduleName="Board Meetings" bucket="learner">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Board Meetings</h1>
            <p className="text-muted-foreground text-sm">
              Schedule and record board meetings with minutes
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Schedule Meeting
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Meetings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{upcoming.length}</p>
            <p className="text-xs text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.completed ?? 0}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.cancelled ?? 0}</p>
            <p className="text-xs text-muted-foreground">Cancelled</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Meetings */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming.map((m: any) => (
                <div key={m._id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      {new Date(m.date).toLocaleDateString()}
                      {m.attendees && m.attendees.length > 0 && (
                        <span className="ml-2">
                          <Users className="h-3 w-3 inline mr-1" />
                          {m.attendees.length} attendees
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Meetings */}
      <Card>
        <CardHeader>
          <CardTitle>Meeting Records</CardTitle>
        </CardHeader>
        <CardContent>
          {!meetings || meetings.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No meetings recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <div
                  key={meeting._id}
                  className="p-4 border border-border rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{meeting.title}</p>
                        <Badge className={statusColors[meeting.status] || ""}>
                          {meeting.status}
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(meeting.date).toLocaleDateString()}
                        </span>
                        {meeting.attendees && meeting.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {meeting.attendees.length} attendees
                          </span>
                        )}
                      </div>
                      {meeting.summary && (
                        <p className="text-xs text-muted-foreground mt-1">{meeting.summary}</p>
                      )}
                      {meeting.actionItems && meeting.actionItems.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium mb-1">Action Items:</p>
                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                            {meeting.actionItems.map((item: string, i: number) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {meeting.status === "scheduled" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusUpdate(meeting._id, "completed")}
                          >
                            Complete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStatusUpdate(meeting._id, "cancelled")}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(meeting._id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Board Meeting">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Meeting title"
            />
          </div>
          <div>
            <Label>Scheduled Date *</Label>
            <Input
              type="datetime-local"
              value={form.scheduledDate}
              onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Attendees (comma-separated)</Label>
            <Input
              value={form.attendees}
              onChange={(e) => setForm({ ...form, attendees: e.target.value })}
              placeholder="John Doe, Jane Smith"
            />
          </div>
          <div>
            <Label>Summary</Label>
            <textarea
              className="w-full border border-border rounded-md p-2 bg-background text-sm min-h-[80px]"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Meeting summary"
            />
          </div>
          <div>
            <Label>Action Items (one per line)</Label>
            <textarea
              className="w-full border border-border rounded-md p-2 bg-background text-sm min-h-[80px]"
              value={form.actionItems}
              onChange={(e) => setForm({ ...form, actionItems: e.target.value })}
              placeholder="Action item 1&#10;Action item 2"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Schedule Meeting</Button>
          </div>
        </div>
      </Modal>
    </div>
    </EavRouteWrapper>
  );
}
