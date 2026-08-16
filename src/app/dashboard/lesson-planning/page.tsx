"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, BookOpenCheck, FileText, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  draft: { label: "Draft", variant: "secondary" },
  approved: { label: "Approved", variant: "success" },
  taught: { label: "Taught", variant: "default" },
  reviewed: { label: "Reviewed", variant: "warning" },
};

export default function LessonPlanningPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [tab, setTab] = useState<"schemes" | "plans">("schemes");
  const [showAddScheme, setShowAddScheme] = useState(false);

  const schemes = useQuery(
    api.lessonPlans.listSchemesBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const teachers = useQuery(
    api.teachers.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const subjects = useQuery(
    api.subjects.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const classes = useQuery(
    api.classes.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const terms = useQuery(
    api.terms.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createScheme = useMutation(api.lessonPlans.createScheme);

  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [weekNumber, setWeekNumber] = useState("1");
  const [topic, setTopic] = useState("");
  const [objectives, setObjectives] = useState("");

  async function handleCreateScheme(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !teacherId || !subjectId || !classId || !termId || !topic.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createScheme({
        schoolId: school._id,
        teacherId: teacherId as any,
        subjectId: subjectId as any,
        classId: classId as any,
        termId: termId as any,
        weekNumber: parseInt(weekNumber),
        topic: topic.trim(),
        objectives: objectives.split("\n").filter((o) => o.trim()),
      });
      toast.success("Scheme of work created");
      setShowAddScheme(false);
      setTopic("");
      setObjectives("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <EavRouteWrapper moduleName="Lesson Planning" bucket="learner">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lesson Planning</h1>
          <p className="text-muted-foreground text-sm">Schemes of work and lesson plans</p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowAddScheme(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Scheme
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["schemes", "plans"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "schemes" ? "Schemes of Work" : "Lesson Plans"}
          </button>
        ))}
      </div>

      {/* Schemes */}
      {tab === "schemes" && (
        <div className="space-y-4">
          {schemes === undefined ? (
            <div className="flex items-center justify-center p-8">
              <BrandLoader variant="book" size="md" />
            </div>
          ) : schemes.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                <BookOpenCheck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                No schemes of work yet. Create one to start planning.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {schemes.map((s) => (
                <Card key={s._id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold">{s.topic}</h3>
                        <p className="text-xs text-muted-foreground">Week {s.weekNumber}</p>
                      </div>
                      <Badge variant={STATUS_CONFIG[s.status]?.variant as any}>
                        {STATUS_CONFIG[s.status]?.label}
                      </Badge>
                    </div>
                    {s.objectives.length > 0 && (
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                        {s.objectives.slice(0, 3).map((o, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lesson Plans placeholder */}
      {tab === "plans" && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Select a scheme of work to view its lesson plans.
          </CardContent>
        </Card>
      )}

      {/* Add scheme modal */}
      <Modal open={showAddScheme} onClose={() => setShowAddScheme(false)} title="New Scheme of Work">
        <form onSubmit={handleCreateScheme} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Teacher *</Label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                <option value="">Select teacher</option>
                {teachers?.map((t) => (
                  <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Subject *</Label>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">Select subject</option>
                {subjects?.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Class *</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Select class</option>
                {classes?.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Term *</Label>
              <Select value={termId} onChange={(e) => setTermId(e.target.value)} required>
                <option value="">Select term</option>
                {terms?.map((t) => (
                  <option key={t._id} value={t._id}>{t.name} {t.year}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Week #</Label>
              <Input type="number" min="1" value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Topic *</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="e.g. Introduction to Fractions" />
          </div>
          <div>
            <Label>Objectives (one per line)</Label>
            <textarea
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="By the end of the lesson, students will be able to..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAddScheme(false)}>Cancel</Button>
            <Button type="submit">Create Scheme</Button>
          </div>
        </form>
      </Modal>
    </div>
    </EavRouteWrapper>
  );
}

