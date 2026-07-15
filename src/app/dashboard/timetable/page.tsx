"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30",
];

export default function TimetablePage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const subjects = useQuery(api.subjects.listBySchool, school ? { schoolId: school._id } : "skip");
  const teachers = useQuery(api.teachers.listBySchool, school ? { schoolId: school._id } : "skip");

  const [selectedClass, setSelectedClass] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");
  const [room, setRoom] = useState("");

  const timetable = useQuery(
    api.timetable.listByClass,
    selectedClass ? { classId: selectedClass as Id<"classes"> } : "skip"
  );

  const createEntry = useMutation(api.timetable.create);
  const removeEntry = useMutation(api.timetable.remove);
  const clearTimetable = useMutation(api.timetable.clearClassTimetable);

  const subjectMap = new Map(subjects?.map((s) => [s._id, s]) ?? []);
  const teacherMap = new Map(teachers?.map((t) => [t._id, t]) ?? []);

  if (classes === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedClass || !subjectId) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createEntry({
        schoolId: school._id,
        classId: selectedClass as Id<"classes">,
        subjectId: subjectId as Id<"subjects">,
        teacherId: teacherId ? (teacherId as Id<"teachers">) : undefined,
        dayOfWeek,
        startTime,
        endTime,
        room: room.trim() || undefined,
      });
      toast.success("Timetable entry added");
      setShowModal(false);
      setSubjectId("");
      setTeacherId("");
      setStartTime("08:00");
      setEndTime("08:45");
      setRoom("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add entry");
    }
  }

  async function handleRemove(id: Id<"timetable_entries">) {
    try {
      await removeEntry({ id });
      toast.success("Entry removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove entry");
    }
  }

  async function handleClearAll() {
    if (!selectedClass || !confirm("Clear the entire timetable for this class?")) return;
    try {
      await clearTimetable({ classId: selectedClass as Id<"classes"> });
      toast.success("Timetable cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear timetable");
    }
  }

  type TimetableEntry = NonNullable<typeof timetable>[number];
  const timetableByDay: Record<number, TimetableEntry[]> = {};
  if (timetable) {
    for (const entry of timetable) {
      if (!timetableByDay[entry.dayOfWeek]) timetableByDay[entry.dayOfWeek] = [];
      timetableByDay[entry.dayOfWeek].push(entry);
    }
    for (const day of Object.keys(timetableByDay)) {
      timetableByDay[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Timetable</h1>
          <p className="text-muted-foreground mt-1">Manage class schedules</p>
        </div>
        <div className="flex gap-2">
          {selectedClass && timetable && timetable.length > 0 && (
            <Button variant="danger" onClick={handleClearAll}>Clear All</Button>
          )}
          <Button onClick={() => setShowModal(true)} disabled={!selectedClass}>
            <Plus className="h-4 w-4 mr-2" /> Add Entry
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="class">Select Class</Label>
        <Select id="class" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
          <option value="">Select a class</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {selectedClass && timetable && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day, idx) => (
            <Card key={idx}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{day}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {timetableByDay[idx]?.length === 0 && (
                  <p className="text-xs text-muted-foreground">No classes</p>
                )}
                {timetableByDay[idx]?.map((entry) => {
                  const subject = subjectMap.get(entry.subjectId);
                  const teacher = entry.teacherId ? teacherMap.get(entry.teacherId) : null;
                  return (
                    <div
                      key={entry._id}
                      className="flex items-center justify-between p-2 rounded bg-secondary/5 border border-border"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {subject?.name ?? "Unknown"} ({subject?.code})
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.startTime} - {entry.endTime}
                          {teacher && ` | ${teacher.firstName} ${teacher.lastName}`}
                          {entry.room && ` | ${entry.room}`}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(entry._id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Timetable Entry">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="dayOfWeek">Day</Label>
            <Select id="dayOfWeek" value={dayOfWeek.toString()} onChange={(e) => setDayOfWeek(parseInt(e.target.value))}>
              {DAYS.map((day, idx) => (
                <option key={idx} value={idx}>{day}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="subjectId">Subject</Label>
            <Select id="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="">Select subject</option>
              {subjects?.map((s) => (
                <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="teacherId">Teacher</Label>
            <Select id="teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Select teacher (optional)</option>
              {teachers?.map((t) => (
                <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Select id="startTime" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Select id="endTime" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="room">Room</Label>
            <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Lab 1, Room 12" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
