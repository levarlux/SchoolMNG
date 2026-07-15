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
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

const CBC_LEVELS = [
  { value: "pre_primary", label: "Pre-Primary" },
  { value: "lower_primary", label: "Lower Primary" },
  { value: "upper_primary", label: "Upper Primary" },
  { value: "junior_secondary", label: "Junior Secondary" },
  { value: "senior_secondary", label: "Senior Secondary" },
  { value: "general", label: "General" },
];

export default function SubjectsPage() {
  const school = useSchool();
  const subjects = useQuery(api.subjects.listBySchool, school ? { schoolId: school._id } : "skip");
  const createSubject = useMutation(api.subjects.create);
  const deleteSubject = useMutation(api.subjects.remove);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [level, setLevel] = useState<string>("general");

  if (subjects === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = subjects.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !name.trim() || !code.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createSubject({
        schoolId: school._id,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        level: level as any,
      });
      toast.success("Subject created");
      setShowModal(false);
      setName("");
      setCode("");
      setLevel("general");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create subject");
    }
  }

  async function handleDelete(id: Id<"subjects">) {
    if (!confirm("Are you sure you want to delete this subject?")) return;
    try {
      await deleteSubject({ id });
      toast.success("Subject deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete subject");
    }
  }

  const grouped = CBC_LEVELS.map((l) => ({
    ...l,
    subjects: filtered.filter((s) => s.level === l.value),
  })).filter((g) => g.subjects.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subjects</h1>
          <p className="text-muted-foreground mt-1">{subjects.length} total subjects</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Subject
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {grouped.map((group) => (
        <Card key={group.value}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-secondary/5">
                <tr>
                  <th className="text-left p-3 font-medium">Code</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.subjects.map((s) => (
                  <tr key={s._id} className="border-t border-border hover:bg-secondary/5">
                    <td className="p-3 font-mono font-medium">{s.code}</td>
                    <td className="p-3">{s.name}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(s._id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No subjects found
          </CardContent>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Subject">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Subject Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" required />
            </div>
            <div>
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MAT" required maxLength={10} />
            </div>
          </div>
          <div>
            <Label htmlFor="level">CBC Level</Label>
            <Select id="level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {CBC_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Subject</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
