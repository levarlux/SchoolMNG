"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function TeachersPage() {
  const school = useSchool();
  const teachers = useQuery(api.teachers.listBySchool, school ? { schoolId: school._id } : "skip");
  const createTeacher = useMutation(api.teachers.create);
  const deleteTeacher = useMutation(api.teachers.remove);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [staffNo, setStaffNo] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");

  if (teachers === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = teachers.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.firstName.toLowerCase().includes(q) ||
      t.lastName.toLowerCase().includes(q) ||
      t.staffNo.toLowerCase().includes(q)
    );
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !firstName.trim() || !lastName.trim() || !staffNo.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createTeacher({
        schoolId: school._id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        staffNo: staffNo.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
      });
      toast.success("Teacher added");
      setShowModal(false);
      setFirstName("");
      setLastName("");
      setStaffNo("");
      setEmail("");
      setPhone("");
      setDepartment("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add teacher");
    }
  }

  async function handleDelete(id: Id<"teachers">) {
    if (!confirm("Are you sure you want to delete this teacher?")) return;
    try {
      await deleteTeacher({ id });
      toast.success("Teacher deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete teacher");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teachers</h1>
          <p className="text-muted-foreground mt-1">{teachers.length} total teachers</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Teacher
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or staff number..."
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
                <th className="text-left p-3 font-medium">Staff No</th>
                <th className="text-left p-3 font-medium">Department</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t._id} className="border-t border-border hover:bg-secondary/5">
                  <td className="p-3 font-medium">{t.firstName} {t.lastName}</td>
                  <td className="p-3 font-mono text-muted-foreground">{t.staffNo}</td>
                  <td className="p-3">{t.department || "—"}</td>
                  <td className="p-3 text-muted-foreground">{t.email || "—"}</td>
                  <td className="p-3 text-muted-foreground">{t.phone || "—"}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(t._id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No teachers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Teacher">
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
            <Label htmlFor="staffNo">Staff Number</Label>
            <Input id="staffNo" value={staffNo} onChange={(e) => setStaffNo(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sciences, Humanities" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Teacher</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
