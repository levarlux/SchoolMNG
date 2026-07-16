"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIME_SLOTS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30",
];

export default function TimetablePage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const subjects = useQuery(api.subjects.listBySchool, school ? { schoolId: school._id } : "skip");

  const timetable = useQuery(
    api.timetable.listMyTimetable,
    school ? { schoolId: school._id } : "skip"
  );

  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");
  const [room, setRoom] = useState("");

  const createEntry = useMutation(api.timetable.create);
  const removeEntry = useMutation(api.timetable.remove);
  const clearMyTimetable = useMutation(api.timetable.clearMyTimetable);

  const subjectMap = new Map(subjects?.map((s) => [s._id, s]) ?? []);
  const classMap = new Map(classes?.map((c) => [c._id, c]) ?? []);

  if (classes === undefined || subjects === undefined || timetable === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function openAddModal(dayIndex: number) {
    setSelectedDay(dayIndex);
    setClassId("");
    setSubjectId("");
    setStartTime("08:00");
    setEndTime("08:45");
    setRoom("");
    setShowModal(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !classId || !subjectId) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createEntry({
        schoolId: school._id,
        classId: classId as Id<"classes">,
        subjectId: subjectId as Id<"subjects">,
        dayOfWeek: selectedDay,
        startTime,
        endTime,
        room: room.trim() || undefined,
      });
      toast.success("Timetable entry added");
      setShowModal(false);
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
    if (!school || !confirm("Clear your entire timetable for this week?")) return;
    try {
      await clearMyTimetable({ schoolId: school._id });
      toast.success("Timetable cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear timetable");
    }
  }

  type TimetableEntry = NonNullable<typeof timetable>[number];
  const timetableByDay: Record<number, TimetableEntry[]> = {};
  for (const entry of timetable) {
    if (!timetableByDay[entry.dayOfWeek]) timetableByDay[entry.dayOfWeek] = [];
    timetableByDay[entry.dayOfWeek].push(entry);
  }
  for (const day of Object.keys(timetableByDay)) {
    timetableByDay[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Conflict check: same class + overlapping time on the same day
  const dayEntries = timetableByDay[selectedDay] ?? [];
  const conflictingEntry = classId
    ? dayEntries.find(
        (e) =>
          e.classId === classId &&
          e.startTime < endTime &&
          e.endTime > startTime
      )
    : null;
  const conflictSubject = conflictingEntry ? subjectMap.get(conflictingEntry.subjectId) : null;
  const conflictClass = conflictingEntry ? classMap.get(conflictingEntry.classId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Timetable</h1>
          <p className="text-muted-foreground mt-1">Plan your weekly schedule</p>
        </div>
        {timetable.length > 0 && (
          <Button variant="danger" onClick={handleClearAll}>Clear All</Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {DAYS.map((day, idx) => (
          <Card key={idx}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">{day}</CardTitle>
              <button
                onClick={() => openAddModal(idx)}
                className="p-1 rounded hover:bg-secondary"
                title={`Add entry to ${day}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(!timetableByDay[idx] || timetableByDay[idx].length === 0) && (
                <p className="text-xs text-muted-foreground">No classes</p>
              )}
              {timetableByDay[idx]?.map((entry) => {
                const subject = subjectMap.get(entry.subjectId);
                const cls = classMap.get(entry.classId);
                return (
                  <div
                    key={entry._id}
                    className="flex items-center justify-between p-2 rounded bg-secondary/5 border border-border"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {subject?.name ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.startTime} - {entry.endTime}
                        {cls && ` | ${cls.name}`}
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={`Add Entry — ${DAYS[selectedDay]}`}>
        <form onSubmit={handleCreate} className="space-y-4">
          {conflictingEntry && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Class already booked</p>
                <p>
                  {conflictClass?.name ?? "This class"} already has {conflictSubject?.name ?? "a lesson"} on{" "}
                  {DAYS[selectedDay]} from {conflictingEntry.startTime} to {conflictingEntry.endTime}.
                  Pick a different time or class.
                </p>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="classId">Class</Label>
            <Select id="classId" value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="subjectId">Subject</Label>
            <Select id="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
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
            <Button type="submit" disabled={!!conflictingEntry}>Add Entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
