"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { Users, Plus, Search, Phone, Mail, Trash2, Link as LinkIcon, UserCheck } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

const relationships = ["father", "mother", "guardian", "grandparent", "sibling", "other"] as const;
const comms = ["sms", "call", "email", "app"] as const;

export default function GuardiansPage() {
  const school = useSchool();

  // State declarations FIRST (before hooks that reference them)
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    phone2: "",
    email: "",
    address: "",
    idNumber: "",
    relationship: "father" as typeof relationships[number],
    communicationPreference: "sms" as typeof comms[number],
  });

  // Queries — AFTER state declarations
  const guardians = useQuery(
    api.guardians.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.guardians.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const searchGuardians = useQuery(
    api.guardians.searchByName,
    school && searchQuery.length >= 2
      ? { schoolId: school._id, query: searchQuery }
      : "skip"
  );
  const students = useQuery(
    api.students.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const linkedStudents = useQuery(
    api.guardians.getLinkedStudents,
    selectedGuardian ? { guardianId: selectedGuardian as Id<"guardians"> } : "skip"
  );

  // Mutations
  const createGuardian = useMutation(api.guardians.create);
  const removeGuardian = useMutation(api.guardians.remove);
  const linkGuardian = useMutation(api.guardianLinks.create);
  const removeLink = useMutation(api.guardianLinks.remove);

  const handleCreate = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim()) {
      toast.error("First name, last name, and phone are required");
      return;
    }
    await createGuardian({
      schoolId: school!._id,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      phone2: form.phone2.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      idNumber: form.idNumber.trim() || undefined,
      relationship: form.relationship,
      communicationPreference: form.communicationPreference,
    });
    toast.success("Guardian created");
    setModalOpen(false);
    setForm({ firstName: "", lastName: "", phone: "", phone2: "", email: "", address: "", idNumber: "", relationship: "father", communicationPreference: "sms" });
  };

  const handleDelete = async (id: Id<"guardians">) => {
    if (!confirm("Delete this guardian and all their links?")) return;
    await removeGuardian({ id });
    toast.success("Guardian deleted");
  };

  const handleLink = async (studentId: string) => {
    if (!selectedGuardian) return;
    try {
      await linkGuardian({
        schoolId: school!._id,
        guardianId: selectedGuardian as Id<"guardians">,
        studentId: studentId as Id<"students">,
        isPrimary: false,
      });
      toast.success("Student linked to guardian");
    } catch (error) {
      toast.error("Failed to link — may already be linked");
    }
  };

  const handleUnlink = async (linkId: string) => {
    await removeLink({ id: linkId as Id<"guardian_links"> });
    toast.success("Link removed");
  };

  const filteredStudents = studentSearch.length >= 2
    ? students?.filter((s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.admNo.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : [];

  if (!school) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const displayGuardians = searchQuery.length >= 2 ? searchGuardians : guardians;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Guardians</h1>
            <p className="text-muted-foreground text-sm">
              Manage parent/guardian records and student links
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Guardian
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.totalGuardians ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Guardians</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.totalLinks ?? 0}</p>
            <p className="text-xs text-muted-foreground">Student Links</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{stats?.studentsWithGuardians ?? 0}</p>
            <p className="text-xs text-muted-foreground">Students with Guardians</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Search guardians by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Guardian List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>All Guardians</CardTitle>
            <CardDescription>
              {displayGuardians?.length ?? 0} guardian(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!displayGuardians || displayGuardians.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No guardians found</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {displayGuardians.map((g) => (
                  <div
                    key={g._id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedGuardian === g._id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedGuardian(g._id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {g.firstName} {g.lastName}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {g.phone}
                          </span>
                          {g.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {g.email}
                            </span>
                          )}
                          <Badge variant="outline">{g.relationship}</Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(g._id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked Students Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Linked Students
            </CardTitle>
            <CardDescription>
              {selectedGuardian
                ? "Students linked to this guardian"
                : "Select a guardian to view links"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedGuardian ? (
              <p className="text-muted-foreground text-sm">
                Select a guardian from the list
              </p>
            ) : (
              <div className="space-y-4">
                {/* Linked Students */}
                {!linkedStudents || linkedStudents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No students linked yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {linkedStudents.map((s) => (
                      <div
                        key={s._id}
                        className="flex items-center justify-between p-2 border border-border rounded"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.admNo}
                            {s.isPrimary && (
                              <Badge variant="default" className="ml-2 text-[10px]">
                                Primary
                              </Badge>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnlink(s.linkId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Student Link */}
                <div>
                  <Label className="text-xs">Link a Student</Label>
                  <Input
                    className="mt-1"
                    placeholder="Search by name or ADM number..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                  {filteredStudents && filteredStudents.length > 0 && (
                    <div className="mt-2 max-h-[200px] overflow-y-auto border border-border rounded">
                      {filteredStudents.slice(0, 10).map((s) => (
                        <div
                          key={s._id}
                          className="flex items-center justify-between p-2 hover:bg-muted cursor-pointer border-b border-border last:border-0"
                          onClick={() => {
                            handleLink(s._id);
                            setStudentSearch("");
                          }}
                        >
                          <div>
                            <p className="text-sm">
                              {s.firstName} {s.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.admNo}
                            </p>
                          </div>
                          <LinkIcon className="h-3 w-3 text-primary" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Guardian Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Guardian">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="First name"
              />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Last name"
              />
            </div>
          </div>
          <div>
            <Label>Phone *</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Primary phone"
            />
          </div>
          <div>
            <Label>Phone 2</Label>
            <Input
              value={form.phone2}
              onChange={(e) => setForm({ ...form, phone2: e.target.value })}
              placeholder="Alternative phone"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Email address"
            />
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Home address"
            />
          </div>
          <div>
            <Label>ID Number</Label>
            <Input
              value={form.idNumber}
              onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
              placeholder="National ID number"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Relationship</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-sm"
                value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value as typeof relationships[number] })}
              >
                {relationships.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Communication</Label>
              <select
                className="w-full border border-border rounded-md p-2 bg-background text-sm"
                value={form.communicationPreference}
                onChange={(e) => setForm({ ...form, communicationPreference: e.target.value as typeof comms[number] })}
              >
                {comms.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Guardian</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
