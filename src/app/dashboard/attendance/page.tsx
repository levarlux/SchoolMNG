"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "present", label: "Present", icon: CheckCircle2, color: "text-green-600" },
  { value: "absent", label: "Absent", icon: XCircle, color: "text-red-600" },
  { value: "late", label: "Late", icon: Clock, color: "text-yellow-600" },
  { value: "excused", label: "Excused", icon: AlertCircle, color: "text-blue-600" },
];

function todayString() {
  return new Date().toISOString().split("T")[0];
}

export default function AttendancePage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const markAttendance = useMutation(api.attendance.markAttendance);

  const [selectedClass, setSelectedClass] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [attendance, setAttendance] = useState<Record<string, string>>({});

  const students = useQuery(
    api.students.listByClass,
    selectedClass ? { classId: selectedClass as Id<"classes"> } : "skip"
  );

  const existingRecords = useQuery(
    api.attendance.listByClassAndDate,
    selectedClass ? { classId: selectedClass as Id<"classes">, date: new Date(selectedDate).getTime() } : "skip"
  );

  // Merge existing records into attendance state
  const [loaded, setLoaded] = useState(false);
  if (existingRecords && students && !loaded && existingRecords.length > 0) {
    const map: Record<string, string> = {};
    for (const r of existingRecords) {
      map[r.studentId] = r.status;
    }
    setAttendance(map);
    setLoaded(true);
  }

  if (classes === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function setStudentStatus(studentId: string, status: string) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAll(status: string) {
    if (!students) return;
    const map: Record<string, string> = {};
    for (const s of students) {
      map[s._id] = status;
    }
    setAttendance(map);
  }

  async function handleSave() {
    if (!school || !selectedClass || !students) return;

    const records = students.map((s) => ({
      studentId: s._id,
      status: (attendance[s._id] || "present") as "present" | "absent" | "late" | "excused",
    }));

    try {
      await markAttendance({
        schoolId: school._id,
        classId: selectedClass as Id<"classes">,
        date: new Date(selectedDate).getTime(),
        markedBy: "admin",
        records,
      });
      toast.success("Attendance saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save attendance");
    }
  }

  const presentCount = Object.values(attendance).filter((s) => s === "present").length;
  const absentCount = Object.values(attendance).filter((s) => s === "absent").length;
  const lateCount = Object.values(attendance).filter((s) => s === "late").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attendance</h1>
        <p className="text-muted-foreground mt-1">Mark daily class attendance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="class">Class</Label>
          <Select id="class" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setAttendance({}); setLoaded(false); }} required>
            <option value="">Select a class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">Date</Label>
          <input
            id="date"
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setAttendance({}); setLoaded(false); }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={!selectedClass || !students || students.length === 0}>
            <Save className="h-4 w-4 mr-2" /> Save Attendance
          </Button>
        </div>
      </div>

      {selectedClass && students && students.length > 0 && (
        <>
          <div className="flex gap-4 items-center">
            <Button variant="outline" size="sm" onClick={() => markAll("present")}>All Present</Button>
            <Button variant="outline" size="sm" onClick={() => markAll("absent")}>All Absent</Button>
            {students && (
              <span className="text-sm text-muted-foreground ml-auto">
                {students.length} students | {presentCount} present | {absentCount} absent | {lateCount} late
              </span>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-3 font-medium">Student</th>
                    <th className="text-left p-3 font-medium">Adm No</th>
                    {STATUS_OPTIONS.map((opt) => (
                      <th key={opt.value} className="text-center p-3 font-medium">{opt.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s._id} className="border-t border-border hover:bg-secondary/5">
                      <td className="p-3 font-medium">{s.firstName} {s.lastName}</td>
                      <td className="p-3 text-muted-foreground font-mono">{s.admNo}</td>
                      {STATUS_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = (attendance[s._id] || "present") === opt.value;
                        return (
                          <td key={opt.value} className="p-3 text-center">
                            <button
                              onClick={() => setStudentStatus(s._id, opt.value)}
                              className={`p-2 rounded-lg transition-colors ${
                                isSelected
                                  ? `${opt.color} bg-current/10`
                                  : "text-muted-foreground hover:bg-secondary/10"
                              }`}
                              title={opt.label}
                            >
                              <Icon className="h-5 w-5" />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {selectedClass && students && students.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No students in this class
          </CardContent>
        </Card>
      )}
    </div>
  );
}
