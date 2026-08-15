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
import { Plus, MessageSquare, Calendar } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export default function ParentMeetingsPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [showAdd, setShowAdd] = useState(false);

  const meetings = useQuery(
    api.parentMeetings.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const teachers = useQuery(
    api.teachers.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createMeeting = useMutation(api.parentMeetings.create);
  const removeMeeting = useMutation(api.parentMeetings.remove);

  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !teacherId || !date || !topic.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createMeeting({
        schoolId: school._id,
        teacherId: teacherId as any,
        studentId: studentId ? (studentId as any) : undefined,
        date: new Date(date).getTime(),
        topic: topic.trim(),
        notes: notes || undefined,
        outcome: outcome || undefined,
      });
      toast.success("Meeting logged");
      setShowAdd(false);
      setTopic("");
      setNotes("");
      setOutcome("");
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
          <h1 className="text-2xl font-bold">Parent Meetings</h1>
          <p className="text-muted-foreground text-sm">Log parent-teacher meetings and follow-ups</p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Log Meeting
          </Button>
        )}
      </div>

      {meetings === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : meetings.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No parent meetings logged yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Card key={m._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{formatDate(m.date)}</span>
                    </div>
                    <h3 className="font-medium">{m.topic}</h3>
                    {m.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{m.notes}</p>
                    )}
                    {m.outcome && (
                      <p className="text-sm mt-1"><strong>Outcome:</strong> {m.outcome}</p>
                    )}
                    {m.followUpDate && (
                      <p className="text-xs text-orange-600 mt-1">
                        Follow-up: {formatDate(m.followUpDate)}
                      </p>
                    )}
                  </div>
                  {isLeadership && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive text-xs"
                      onClick={async () => {
                        try {
                          await removeMeeting({ id: m._id });
                          toast.success("Removed");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed");
                        }
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Parent Meeting">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Teacher *</Label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                <option value="">Select teacher</option>
                {teachers?.map((t) => (
                  <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Student (optional)</Label>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">General meeting</option>
                {students?.map((s) => (
                  <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <Label>Topic *</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="e.g. Academic progress, Behavior concerns" />
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Discussion points, concerns raised..."
            />
          </div>
          <div>
            <Label>Outcome</Label>
            <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Agreed to tutor, parents will follow up" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Log Meeting</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

