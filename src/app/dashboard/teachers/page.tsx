"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Upload, Download, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { ImportStudio } from "@/components/import-studio";
import { TeacherProfileView } from "@/components/teacher-profile-view";

export default function TeachersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-16">
          <BrandLoader variant="book" size="md" />
        </div>
      }
    >
      <TeachersContent />
    </Suspense>
  );
}

function TeachersContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  if (view) return <TeacherProfileView teacherId={view} />;
  return <TeachersList />;
}

function TeachersList() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const router = useRouter();
  const teachers = useQuery(api.teachers.listBySchool, school ? { schoolId: school._id } : "skip");
  const createTeacher = useMutation(api.teachers.create);
  const deleteTeacher = useMutation(api.teachers.remove);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "teaching" | "non_teaching">("all");
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [staffNo, setStaffNo] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState<"teaching" | "non_teaching">("teaching");

  if (teachers === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const filtered = teachers.filter((t) => {
    if (categoryFilter !== "all" && (t.category ?? "teaching") !== categoryFilter) return false;
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
        category,
      });
      toast.success("Teacher added");
      setShowModal(false);
      setFirstName("");
      setLastName("");
      setStaffNo("");
      setEmail("");
      setPhone("");
      setDepartment("");
      setCategory("teaching");
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
          <h1 className="text-3xl font-bold">Teachers & Staff</h1>
          <p className="text-muted-foreground mt-1">
            {teachers.length} total ·{" "}
            {teachers.filter((t) => (t.category ?? "teaching") === "teaching").length} teachers ·{" "}
            {teachers.filter((t) => t.category === "non_teaching").length} staff
          </p>
        </div>
        {isLeadership && (
          <div className="flex gap-2">
            {teachers.length > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  exportToCsv(
                    teachers.map((t) => ({
                      "First Name": t.firstName,
                      "Last Name": t.lastName,
                      "Staff No": t.staffNo,
                      Category: (t.category ?? "teaching") === "teaching" ? "Teacher" : "Staff",
                      Department: t.department ?? "",
                      Email: t.email ?? "",
                      Phone: t.phone ?? "",
                    })),
                    "teachers"
                  )
                }
              >
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Teacher
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(["all", "teaching", "non_teaching"] as const).map((c) => (
          <Button
            key={c}
            variant={categoryFilter === c ? "default" : "outline"}
            size="sm"
            onClick={() => setCategoryFilter(c)}
          >
            {c === "all" ? "All" : c === "teaching" ? "Teachers" : "Staff"}
          </Button>
        ))}
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
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Staff No</th>
                <th className="text-left p-3 font-medium">Department</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Phone</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t._id}
                  className="border-t border-border hover:bg-secondary/5 cursor-pointer"
                  onClick={() => router.push(`/dashboard/teachers?view=${t._id}`)}
                >
                  <td className="p-3 font-medium">{t.firstName} {t.lastName}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        (t.category ?? "teaching") === "teaching"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {(t.category ?? "teaching") === "teaching" ? "Teacher" : "Staff"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground">{t.staffNo}</td>
                  <td className="p-3">{t.department || "—"}</td>
                  <td className="p-3 text-muted-foreground">{t.email || "—"}</td>
                  <td className="p-3 text-muted-foreground">{t.phone || "—"}</td>
                  <td className="p-3 text-right">
                    {isLeadership && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t._id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No teachers or staff found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Teacher / Staff">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="staffNo">Staff Number</Label>
              <Input id="staffNo" value={staffNo} onChange={(e) => setStaffNo(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as "teaching" | "non_teaching")}>
                <option value="teaching">Teacher</option>
                <option value="non_teaching">Staff (non-teaching)</option>
              </Select>
            </div>
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

      <ImportStudio open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}

