"use client";

import { useState, useMemo, use } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = use(params);
  const school = useSchool();
  const exam = useQuery(api.exams.get, { id: examId as Id<"exams"> });
  const results = useQuery(api.exams.getResults, { examId: examId as Id<"exams"> });
  const subjects = useQuery(api.subjects.listBySchool, school ? { schoolId: school._id } : "skip");
  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const enterResults = useMutation(api.exams.enterResults);

  const [marks, setMarks] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const resultsByStudent = useMemo(() => {
    if (!results) return {};
    const map: Record<string, Record<string, typeof results[0]>> = {};
    for (const r of results) {
      if (!map[r.studentId]) map[r.studentId] = {};
      map[r.studentId][r.subjectId] = r;
    }
    return map;
  }, [results]);

  if (exam === undefined || results === undefined || subjects === undefined || students === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const key = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;

  function setMark(studentId: Id<"students">, subjectId: Id<"subjects">, value: string) {
    const num = parseFloat(value);
    setMarks((prev) => ({
      ...prev,
      [key(studentId, subjectId)]: isNaN(num) ? 0 : Math.min(100, Math.max(0, num)),
    }));
  }

  async function handleSave() {
    if (!school || !students || !subjects) return;
    setSaving(true);
    try {
      const resultsPayload = students.flatMap((s) =>
        subjects.map((sub) => {
          const k = key(s._id, sub._id);
          const existingResult = resultsByStudent[s._id]?.[sub._id];
          const markValue = marks[k] ?? existingResult?.marks;
          if (markValue === undefined) return null;
          return {
            studentId: s._id,
            subjectId: sub._id,
            marks: markValue,
            grade: computeGrade(markValue),
          };
        }).filter(Boolean)
      ) as { studentId: Id<"students">; subjectId: Id<"subjects">; marks: number; grade: string }[];

      if (resultsPayload.length === 0) {
        toast.error("No marks to save");
        return;
      }

      await enterResults({
        schoolId: school._id,
        examId: examId as Id<"exams">,
        results: resultsPayload,
      });
      toast.success(`Saved ${resultsPayload.length} results`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save results");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{exam.name}</h1>
          <p className="text-muted-foreground mt-1">
            {subjects.length} subjects x {students.length} students
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Results
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-3 font-medium sticky left-0 bg-card z-10">Student</th>
                {subjects.map((s) => (
                  <th key={s._id} className="text-center p-3 font-medium min-w-[100px]">
                    {s.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s._id} className="border-t border-border hover:bg-secondary/5">
                  <td className="p-3 font-medium sticky left-0 bg-card z-10">
                    {s.firstName} {s.lastName}
                  </td>
                  {subjects.map((sub) => {
                    const existing = resultsByStudent[s._id]?.[sub._id];
                    const k = key(s._id, sub._id);
                    const currentValue = marks[k] ?? existing?.marks ?? "";
                    return (
                      <td key={sub._id} className="p-2 text-center">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={currentValue}
                          onChange={(e) => setMark(s._id, sub._id, e.target.value)}
                          className="w-20 mx-auto text-center"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={subjects.length + 1} className="p-6 text-center text-muted-foreground">
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function computeGrade(marks: number): string {
  if (marks >= 80) return "A";
  if (marks >= 75) return "A-";
  if (marks >= 70) return "B+";
  if (marks >= 65) return "B";
  if (marks >= 60) return "B-";
  if (marks >= 55) return "C+";
  if (marks >= 50) return "C";
  if (marks >= 45) return "C-";
  if (marks >= 40) return "D+";
  if (marks >= 35) return "D";
  if (marks >= 30) return "D-";
  if (marks >= 20) return "E";
  return "E";
}
