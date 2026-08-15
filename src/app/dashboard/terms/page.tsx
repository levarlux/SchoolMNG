"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export default function TermsPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const terms = useQuery(api.terms.listBySchool, school ? { schoolId: school._id } : "skip");
  const createTerm = useMutation(api.terms.create);
  const updateTerm = useMutation(api.terms.update);
  const deleteTerm = useMutation(api.terms.remove);

  const academicYears = useQuery(api.academicYears.listBySchool, school ? { schoolId: school._id } : "skip");
  const createAcademicYear = useMutation(api.academicYears.create);
  const activateAcademicYear = useMutation(api.academicYears.activate);
  const activateTerm = useMutation(api.terms.activate);
  const rolloverTerm = useMutation(api.terms.rollover);

  const [showModal, setShowModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [yearLabel, setYearLabel] = useState(new Date().getFullYear().toString());
  const [yearStartDate, setYearStartDate] = useState("");
  const [yearEndDate, setYearEndDate] = useState("");

  if (terms === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !name.trim() || !startDate || !endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      if (!academicYearId) {
        toast.error("Please select an academic year");
        return;
      }
      await createTerm({
        schoolId: school._id,
        academicYearId: academicYearId as any,
        name: name.trim(),
        year: parseInt(year),
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
      });
      toast.success("Term created");
      setShowModal(false);
      setName("");
      setStartDate("");
      setEndDate("");
      setAcademicYearId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create term");
    }
  }

  async function handleActivateTerm(term: Doc<"terms">) {
    try {
      await activateTerm({ id: term._id });
      toast.success(`"${term.name}" is now the active term`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update term");
    }
  }

  async function handleCreateYear(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !yearLabel.trim() || !yearStartDate || !yearEndDate) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      const id = await createAcademicYear({
        schoolId: school._id,
        label: yearLabel.trim(),
        startDate: new Date(yearStartDate).getTime(),
        endDate: new Date(yearEndDate).getTime(),
      });
      toast.success("Academic year created");
      setAcademicYearId(id as string);
      setShowYearModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create academic year");
    }
  }

  async function handleDelete(id: Id<"terms">) {
    if (!confirm("Are you sure you want to delete this term?")) return;
    try {
      await deleteTerm({ id });
      toast.success("Term deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete term");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Academic Terms</h1>
          <p className="text-muted-foreground mt-1">Manage your school terms (Kenya: 3 terms per year)</p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Term
          </Button>
        )}
      </div>

      {/* Academic Years */}
      {academicYears && academicYears.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Academic Years</h2>
            {isLeadership && (
              <Button variant="outline" size="sm" onClick={() => setShowYearModal(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Year
              </Button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {academicYears.map((y) => (
              <Card key={y._id} className={y.status === "active" ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{y.label}</CardTitle>
                    {y.status === "active" && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Active
                      </span>
                    )}
                    {y.status === "closed" && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Closed</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{formatDate(y.startDate)} - {formatDate(y.endDate)}</p>
                  {isLeadership && y.status !== "active" && (
                    <Button variant="outline" size="sm" className="mt-2" onClick={async () => {
                      try {
                        await activateAcademicYear({ id: y._id });
                        toast.success(`"${y.label}" is now active`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    }}>
                      Activate
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {terms.map((t) => (
          <Card key={t._id} className={t.status === "active" ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t.name} {t.year}</CardTitle>
                {t.status === "active" && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                )}
                {t.status === "closed" && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Closed</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(t.startDate)} - {formatDate(t.endDate)}</span>
              </div>
              <div className="flex gap-2">
                {isLeadership && t.status !== "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleActivateTerm(t)}
                  >
                    Set Active
                  </Button>
                )}
                {isLeadership && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(t._id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {terms.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No terms yet. Add your first term to get started.
          </CardContent>
        </Card>
      )}

      <Modal open={showYearModal} onClose={() => setShowYearModal(false)} title="Add Academic Year">
        <form onSubmit={handleCreateYear} className="space-y-4">
          <div>
            <Label htmlFor="yearLabel">Year Label *</Label>
            <Input id="yearLabel" value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} placeholder="e.g. 2026" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="yearStartDate">Start Date *</Label>
              <Input id="yearStartDate" type="date" value={yearStartDate} onChange={(e) => setYearStartDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="yearEndDate">End Date *</Label>
              <Input id="yearEndDate" type="date" value={yearEndDate} onChange={(e) => setYearEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowYearModal(false)}>Cancel</Button>
            <Button type="submit">Add Year</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Term">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Term Name</Label>
              <Select id="name" value={name} onChange={(e) => setName(e.target.value)} required>
                <option value="">Select term</option>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label htmlFor="academicYear">Academic Year *</Label>
            <Select id="academicYear" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} required>
              <option value="">Select academic year</option>
              {academicYears?.map((y) => (
                <option key={y._id} value={y._id}>{y.label} ({y.status})</option>
              ))}
            </Select>
            {academicYears && academicYears.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No academic years yet. <button type="button" className="text-primary hover:underline" onClick={() => { setShowModal(false); setShowYearModal(true); }}>Create one first</button>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Term</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

