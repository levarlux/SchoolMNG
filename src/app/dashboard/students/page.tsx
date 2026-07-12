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
import { Plus, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";

export default function StudentsPage() {
  const school = useSchool();
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const allStudents = useQuery(api.students.listBySchool, school ? { schoolId: school._id } : "skip");
  const createStudent = useMutation(api.students.create);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [admNo, setAdmNo] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedStream, setSelectedStream] = useState("");

  const streamsQuery = useQuery(
    api.streams.listByClass,
    selectedClass ? { classId: selectedClass as any } : "skip"
  );

  const selectedClassData = classes?.find((c) => c._id === selectedClass);

  const filtered = allStudents?.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.firstName.toLowerCase().includes(q) ||
      s.lastName.toLowerCase().includes(q) ||
      s.admNo.toLowerCase().includes(q)
    );
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedClass || !firstName.trim() || !lastName.trim() || !admNo.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    await createStudent({
      schoolId: school._id,
      classId: selectedClass as any,
      streamId: selectedStream ? (selectedStream as any) : undefined,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      admNo: admNo.trim(),
    });
    toast.success("Student created");
    setShowModal(false);
    setFirstName("");
    setLastName("");
    setAdmNo("");
    setSelectedClass("");
    setSelectedStream("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground mt-1">{allStudents?.length ?? 0} total students</p>
        </div>
        <div className="flex items-center gap-2">
          {allStudents && allStudents.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  allStudents.map((s) => ({
                    FirstName: s.firstName,
                    LastName: s.lastName,
                    "Admission No": s.admNo,
                  })),
                  "students"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Student
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or admission number..."
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
                <th className="text-left p-3 font-medium">Adm No</th>
                <th className="text-left p-3 font-medium">Class</th>
                <th className="text-left p-3 font-medium">Stream</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((s) => {
                const sClass = classes?.find((c) => c._id === s.classId);
                return (
                  <tr key={s._id} className="border-t border-border hover:bg-secondary/5">
                    <td className="p-3 font-medium">{s.firstName} {s.lastName}</td>
                    <td className="p-3 text-muted-foreground">{s.admNo}</td>
                    <td className="p-3">{sClass?.name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">—</td>
                  </tr>
                );
              })}
              {filtered?.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Student">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="admNo">Admission Number</Label>
            <Input id="admNo" value={admNo} onChange={(e) => setAdmNo(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="class">Class</Label>
            <Select id="class" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStream(""); }} required>
              <option value="">Select a class</option>
              {classes?.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
          </div>
          {selectedClassData?.hasStreams && (
            <div>
              <Label htmlFor="stream">Stream</Label>
              <Select id="stream" value={selectedStream} onChange={(e) => setSelectedStream(e.target.value)}>
                <option value="">Select a stream</option>
                {streamsQuery?.map((st) => (
                  <option key={st._id} value={st._id}>{st.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Student</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
