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
import { Plus, Search, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

const EXAM_TYPES = [
  { value: "mid_term", label: "Mid Term" },
  { value: "end_term", label: "End Term" },
  { value: "cat", label: "CAT" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export default function ExamsPage() {
  const school = useSchool();
  const exams = useQuery(api.exams.listBySchool, school ? { schoolId: school._id } : "skip");
  const terms = useQuery(api.terms.listBySchool, school ? { schoolId: school._id } : "skip");
  const createExam = useMutation(api.exams.create);
  const deleteExam = useMutation(api.exams.remove);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [termId, setTermId] = useState("");
  const [date, setDate] = useState("");
  const [examType, setExamType] = useState("mid_term");

  if (exams === undefined || terms === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const termMap = new Map(terms.map((t) => [t._id, t]));

  const filtered = exams.filter((e) => {
    if (!search) return true;
    return e.name.toLowerCase().includes(search.toLowerCase());
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !name.trim() || !termId || !date) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createExam({
        schoolId: school._id,
        termId: termId as Id<"terms">,
        name: name.trim(),
        date: new Date(date).getTime(),
        examType: examType as any,
      });
      toast.success("Exam created");
      setShowModal(false);
      setName("");
      setTermId("");
      setDate("");
      setExamType("mid_term");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create exam");
    }
  }

  async function handleDelete(id: Id<"exams">) {
    if (!confirm("Are you sure you want to delete this exam?")) return;
    try {
      await deleteExam({ id });
      toast.success("Exam deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete exam");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Exams</h1>
          <p className="text-muted-foreground mt-1">{exams.length} total exams</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Exam
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Term</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ex) => {
                const term = termMap.get(ex.termId);
                return (
                  <tr key={ex._id} className="border-t border-border hover:bg-secondary/5">
                    <td className="p-3 font-medium">
                      <Link href={`/dashboard/exams/${ex._id}`} className="hover:underline text-primary">
                        {ex.name}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary/10 text-secondary-foreground">
                        {EXAM_TYPES.find((t) => t.value === ex.examType)?.label ?? ex.examType}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{term ? `${term.name} ${term.year}` : "—"}</td>
                    <td className="p-3 text-muted-foreground">{formatDate(ex.date)}</td>
                    <td className="p-3 text-right">
                      <Link href={`/dashboard/exams/${ex._id}`}>
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4 mr-1" /> Results
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(ex._id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No exams found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Exam">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="name">Exam Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid Term 1, End Term 2" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="termId">Term</Label>
              <Select id="termId" value={termId} onChange={(e) => setTermId(e.target.value)} required>
                <option value="">Select term</option>
                {terms.map((t) => (
                  <option key={t._id} value={t._id}>{t.name} {t.year}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="examType">Type</Label>
              <Select id="examType" value={examType} onChange={(e) => setExamType(e.target.value)}>
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create Exam</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
