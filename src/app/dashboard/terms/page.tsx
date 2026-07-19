"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { useRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export default function TermsPage() {
  const school = useSchool();
  const role = useRole();
  const isPrincipal = role === "principal";
  const terms = useQuery(api.terms.listBySchool, school ? { schoolId: school._id } : "skip");
  const createTerm = useMutation(api.terms.create);
  const updateTerm = useMutation(api.terms.update);
  const deleteTerm = useMutation(api.terms.remove);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isCurrent, setIsCurrent] = useState(false);

  if (terms === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
      await createTerm({
        schoolId: school._id,
        name: name.trim(),
        year: parseInt(year),
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        isCurrent,
      });
      toast.success("Term created");
      setShowModal(false);
      setName("");
      setStartDate("");
      setEndDate("");
      setIsCurrent(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create term");
    }
  }

  async function handleToggleCurrent(term: Doc<"terms">) {
    try {
      await updateTerm({ id: term._id, isCurrent: !term.isCurrent });
      toast.success(term.isCurrent ? "Term unset as current" : "Term set as current");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update term");
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
        {isPrincipal && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Term
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {terms.map((t) => (
          <Card key={t._id} className={t.isCurrent ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t.name} {t.year}</CardTitle>
                {t.isCurrent && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Current
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(t.startDate)} - {formatDate(t.endDate)}</span>
              </div>
              <div className="flex gap-2">
                {isPrincipal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleCurrent(t)}
                  >
                    {t.isCurrent ? "Unset Current" : "Set as Current"}
                  </Button>
                )}
                {isPrincipal && (
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
          <div className="flex items-center gap-2">
            <input
              id="isCurrent"
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
              className="rounded border-gray-300"
            />
            <Label htmlFor="isCurrent" className="text-sm">Set as current term</Label>
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
