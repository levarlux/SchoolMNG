"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { FieldRenderer } from "./generic/FieldRenderer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, Phone, Mail, GraduationCap, BookMarked, Users, Layers, ChevronRight, Plus, Link2, Unlink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type EavModule = {
  moduleId: string;
  name: string;
  description?: string;
  sections: Array<{
    sectionId: string;
    name: string;
    description?: string;
    isRepeatable: boolean;
    isSensitive: boolean;
    fields: Array<{
      fieldId: string;
      name: string;
      inputType: string;
      isRequired: boolean;
      isSensitive: boolean;
      options?: string[];
      value: string;
    }>;
  }>;
};

function ModuleRendererInline({
  module,
  values,
  onChange,
  readOnly = false,
}: {
  module: EavModule;
  values?: Record<string, string>;
  onChange?: (fieldId: string, value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      {module.sections.map((sec) => (
        <div key={sec.sectionId} className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            {sec.name}
            {sec.isRepeatable && <Badge variant="secondary" className="text-xs">Repeatable</Badge>}
            {sec.isSensitive && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Sensitive</Badge>
            )}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sec.fields.map((field) => (
              <div
                key={field.fieldId}
                className={
                  field.inputType === "text_long" || field.inputType === "dropdown_multi"
                    ? "md:col-span-2"
                    : ""
                }
              >
                <FieldRenderer
                  name={field.name}
                  inputType={field.inputType}
                  value={values?.[field.fieldId] ?? field.value ?? ""}
                  options={field.options}
                  isRequired={field.isRequired}
                  onChange={
                    readOnly || field.isSensitive
                      ? undefined
                      : (v) => onChange?.(field.fieldId, v)
                  }
                  readOnly={readOnly || field.isSensitive}
                  isSensitive={field.isSensitive}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {module.sections.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">
          No sections configured for this module.
        </p>
      )}
    </div>
  );
}

export function TeacherProfileView({ teacherId }: { teacherId: string }) {
  const id = teacherId;
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  const teacher = useQuery(api.teachers.get, { id: id as any });
  const subjects = useQuery(api.teachers.listSubjectsByTeacher, { teacherId: id as any });
  const learners = useQuery(api.teachers.listLinkedLearners, { teacherId: id as any });
  const linkedClasses = useQuery(api.teachers.listLinkedClasses, { teacherId: id as any });
  const eavData = useQuery(api.records.getTeacherEavModules, { teacherId: id as any });

  const linkLearner = useMutation(api.teachers.linkLearner);
  const linkClass = useMutation(api.teachers.linkClass);
  const unlink = useMutation(api.teachers.unlink);
  const updateTeacher = useMutation(api.teachers.update);
  const setValues = useMutation(api.fieldValues.setValues);
  const createRecord = useMutation(api.records.create);

  const [tab, setTab] = useState<"overview" | "relationships" | "modules">("overview");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showLinkLearner, setShowLinkLearner] = useState(false);
  const [showLinkClass, setShowLinkClass] = useState(false);
  const [eavForm, setEavForm] = useState<Record<string, string>>({});
  const [eavDirty, setEavDirty] = useState(false);
  const [eavSaving, setEavSaving] = useState(false);

  // Core edit form state
  const [form, setForm] = useState<{ firstName: string; lastName: string; staffNo: string; email: string; phone: string; department: string; category: "teaching" | "non_teaching" }>({
    firstName: "",
    lastName: "",
    staffNo: "",
    email: "",
    phone: "",
    department: "",
    category: "teaching",
  });

  useEffect(() => {
    if (!teacher) return;
    setForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      staffNo: teacher.staffNo,
      email: teacher.email ?? "",
      phone: teacher.phone ?? "",
      department: teacher.department ?? "",
      category: (teacher.category ?? "teaching") as "teaching" | "non_teaching",
    });
  }, [teacher]);

  useEffect(() => {
    if (!eavData || eavDirty) return;
    const map: Record<string, string> = {};
    for (const mod of eavData.modules) {
      for (const sec of mod.sections) {
        for (const f of sec.fields) map[f.fieldId] = f.value ?? "";
      }
    }
    setEavForm(map);
  }, [eavData, eavDirty]);

  const studentsQuery = useQuery(
    api.students.listBySchool,
    showLinkLearner && teacher ? { schoolId: teacher.schoolId } : "skip"
  );
  const classesQuery = useQuery(
    api.classes.listBySchool,
    showLinkClass && teacher ? { schoolId: teacher.schoolId } : "skip"
  );

  const [studentPick, setStudentPick] = useState("");
  const [classPick, setClassPick] = useState("");

  if (teacher === undefined || eavData === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  if (teacher === null) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-10 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Teacher not found</h3>
        </CardContent>
      </Card>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Name fields are required");
      return;
    }
    try {
      await updateTeacher({
        id: id as any,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        department: form.department.trim() || undefined,
        category: form.category,
      });
      toast.success("Teacher updated");
      setShowEdit(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update teacher");
    }
  }

  async function handleEavSave() {
    if (!teacher) return;
    setEavSaving(true);
    try {
      let recordId = eavData?.recordId ?? null;
      if (!recordId) {
        recordId = await createRecord({
          schoolId: teacher.schoolId,
          bucket: "teaching_staff",
          displayName: `${teacher.firstName} ${teacher.lastName}`.trim(),
          status: teacher.category === "non_teaching" ? undefined : "active",
          teacherId: teacher._id,
        });
      }
      const entries = Object.keys(eavForm)
        .filter((fieldId) => eavForm[fieldId] !== "")
        .map((fieldId) => ({ fieldId: fieldId as any, value: eavForm[fieldId] }));
      if (entries.length > 0) {
        await setValues({
          schoolId: teacher.schoolId,
          recordId,
          values: entries,
        });
      }
      setEavDirty(false);
      toast.success("Staff data saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setEavSaving(false);
    }
  }

  async function handleLinkLearner() {
    if (!studentPick || !teacher || !isLeadership) return;
    try {
      await linkLearner({ schoolId: teacher.schoolId, teacherId: teacher._id, studentId: studentPick as any });
      toast.success("Learner linked");
      setShowLinkLearner(false);
      setStudentPick("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link learner");
    }
  }

  async function handleLinkClass() {
    if (!classPick || !teacher || !isLeadership) return;
    try {
      await linkClass({ schoolId: teacher.schoolId, teacherId: teacher._id, classId: classPick as any });
      toast.success("Class linked");
      setShowLinkClass(false);
      setClassPick("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link class");
    }
  }

  async function handleUnlink(linkId: string) {
    if (!isLeadership) return;
    if (!confirm("Remove this relationship link?")) return;
    try {
      await unlink({ id: linkId as any });
      toast.success("Link removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove link");
    }
  }

  const t = teacher;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/teachers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Teachers
        </Link>
      </div>

      <Card>
        <CardContent className="p-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
              {`${t.firstName[0] ?? "?"}${t.lastName[0] ?? ""}`.toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {t.firstName} {t.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary" className="text-xs">{t.staffNo}</Badge>
                {(t.category ?? "teaching") === "teaching" ? (
                  <Badge className="text-xs">Teacher</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Staff</Badge>
                )}
                {t.department && <span className="text-sm text-muted-foreground">{t.department}</span>}
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                {t.email && (
                  <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {t.email}</span>
                )}
                {t.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {t.phone}</span>
                )}
              </div>
            </div>
          </div>
          {isLeadership && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 border-b border-border pb-0">
        {(
          [
            ["overview", "Overview", BookMarked],
            ["relationships", "Relationships", Link2],
            ["modules", "Modules", Layers],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 inline mr-1.5 -mt-0.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {(subjects?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookMarked className="h-4 w-4" /> Subject Assignments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {subjects?.map((s) => (
                    <Badge key={s._id} variant="secondary" className="text-xs">
                      {s.subjectId}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Relationships summary
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc list-inside space-y-1">
                <li>{learners?.length ?? 0} linked learner{(learners?.length ?? 0) === 1 ? "" : "s"}</li>
                <li>{linkedClasses?.length ?? 0} linked class{(linkedClasses?.length ?? 0) === 1 ? "" : "es"}</li>
                <li>{subjects?.length ?? 0} subject assignment{(subjects?.length ?? 0) === 1 ? "" : "s"}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "relationships" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Learner links (mentor / counselor)</h2>
            {isLeadership && (
              <Button size="sm" onClick={() => setShowLinkLearner(true)}>
                <Plus className="h-4 w-4 mr-1" /> Link learner
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {learners?.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No linked learners.</p>
              )}
              {learners?.map((l) => (
                <div key={l.linkId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.admNo}{l.role ? ` · ${l.role}` : ""}</p>
                  </div>
                  {isLeadership && (
                    <button
                      onClick={() => handleUnlink(l.linkId)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                      aria-label="Unlink learner"
                    >
                      <Unlink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <h2 className="text-base font-semibold">Class assignments (class teacher)</h2>
            {isLeadership && (
              <Button size="sm" onClick={() => setShowLinkClass(true)}>
                <Plus className="h-4 w-4 mr-1" /> Link class
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {linkedClasses?.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No linked classes.</p>
              )}
              {linkedClasses?.map((c) => (
                <div key={c.linkId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                    {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                  </div>
                  {isLeadership && (
                    <button
                      onClick={() => handleUnlink(c.linkId)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                      aria-label="Unlink class"
                    >
                      <Unlink className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "modules" && (
        <div className="space-y-4">
          {eavData === null && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg">Teacher not found</h3>
              </CardContent>
            </Card>
          )}

          {eavData && eavData.modules.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg">No Staff Modules Configured</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  No staff modules are enabled yet. Enable modules in Settings to start
                  recording extended staff data.
                </p>
              </CardContent>
            </Card>
          )}

          {eavData && eavData.modules.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-1 space-y-1">
                {eavData.modules.map((mod) => (
                  <button
                    key={mod.moduleId}
                    onClick={() => setActiveModule(mod.moduleId)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                      activeModule === mod.moduleId
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{mod.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    </div>
                    {mod.description && (
                      <p className="text-xs opacity-70 mt-0.5 truncate">{mod.description}</p>
                    )}
                  </button>
                ))}
                {isLeadership && (
                  <Link
                    href="/dashboard/settings"
                    className="block px-3 py-2.5 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                    Edit structure
                  </Link>
                )}
              </div>

              <div className="lg:col-span-3">
                {activeModule ? (
                  (() => {
                    const mod = eavData.modules.find((m) => m.moduleId === activeModule);
                    if (!mod) return null;
                    return (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>{mod.name}</span>
                            {eavDirty && isLeadership && (
                              <Button onClick={handleEavSave} disabled={eavSaving} size="sm">
                                {eavSaving ? (
                                  <BrandLoader variant="dots" size="sm" className="mr-2" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                )}
                                Save
                              </Button>
                            )}
                          </CardTitle>
                          {mod.description && <CardDescription>{mod.description}</CardDescription>}
                        </CardHeader>
                        <CardContent>
                          <ModuleRendererInline
                            module={mod as EavModule}
                            values={eavForm}
                            onChange={
                              isLeadership
                                ? (fieldId, value) => {
                                    setEavForm((f) => ({ ...f, [fieldId]: value }));
                                    setEavDirty(true);
                                  }
                                : undefined
                            }
                            readOnly={!isLeadership}
                          />
                        </CardContent>
                      </Card>
                    );
                  })()
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="p-10 text-center">
                      <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Select a module from the left to view its data.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Teacher">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-first">First Name *</Label>
              <Input id="tpl-first" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
            </div>
            <div>
              <Label htmlFor="tpl-last">Last Name *</Label>
              <Input id="tpl-last" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
            </div>
          </div>
          <div>
            <Label htmlFor="tpl-staffNo">Staff Number</Label>
            <Input id="tpl-staffNo" value={form.staffNo} disabled />
            <p className="text-xs text-muted-foreground mt-1">Staff numbers are managed by the school blueprint.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-email">Email</Label>
              <Input id="tpl-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tpl-phone">Phone</Label>
              <Input id="tpl-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-dept">Department</Label>
              <Input id="tpl-dept" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="e.g. Sciences, Humanities" />
            </div>
            <div>
              <Label htmlFor="tpl-cat">Category</Label>
              <Select id="tpl-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as "teaching" | "non_teaching" }))}>
                <option value="teaching">Teacher</option>
                <option value="non_teaching">Staff (non-teaching)</option>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showLinkLearner} onClose={() => setShowLinkLearner(false)} title="Link Learner">
        <div className="space-y-4">
          <div>
            <Label>Learner</Label>
            <Select value={studentPick} onChange={(e) => setStudentPick(e.target.value)}>
              <option value="">Select a learner…</option>
              {studentsQuery?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.firstName} {s.lastName} ({s.admNo})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowLinkLearner(false)}>Cancel</Button>
            <Button onClick={handleLinkLearner} disabled={!studentPick}>Link</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showLinkClass} onClose={() => setShowLinkClass(false)} title="Link Class">
        <div className="space-y-4">
          <div>
            <Label>Class</Label>
            <Select value={classPick} onChange={(e) => setClassPick(e.target.value)}>
              <option value="">Select a class…</option>
              {classesQuery?.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowLinkClass(false)}>Cancel</Button>
            <Button onClick={handleLinkClass} disabled={!classPick}>Link</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}