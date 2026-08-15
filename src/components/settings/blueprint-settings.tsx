"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Plus, Save, Trash2, Hash, ScrollText, Sigma } from "lucide-react";
import { toast } from "sonner";

type Band = { min: number; max: number; grade: string; comment?: string };

/**
 * School Blueprint — the school's own conventions:
 * admission/staff number formats, term naming, and grading scale.
 * Everything stays optional: defaults keep existing behaviour unchanged.
 */
export function BlueprintSettings() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  const blueprint = useQuery(
    api.blueprints.getBlueprint,
    school ? { schoolId: school._id } : "skip"
  );
  const nextAdm = useQuery(
    api.blueprints.suggestAdmissionNumber,
    school ? { schoolId: school._id } : "skip"
  );
  const nextStaff = useQuery(
    api.blueprints.suggestStaffNumber,
    school ? { schoolId: school._id } : "skip"
  );
  const saveBlueprint = useMutation(api.blueprints.saveBlueprint);

  const [admPrefix, setAdmPrefix] = useState("ADM");
  const [admPattern, setAdmPattern] = useState("{prefix}-{timestamp}-{seq}");
  const [staffPrefix, setStaffPrefix] = useState("STF");
  const [staffPattern, setStaffPattern] = useState("{prefix}-{timestamp}-{seq}");
  const [termNaming, setTermNaming] = useState("Term {n}");
  const [termsPerYear, setTermsPerYear] = useState(3);
  const [bands, setBands] = useState<Band[]>([
    { min: 80, max: 100, grade: "A", comment: "Excellent" },
    { min: 70, max: 79, grade: "B", comment: "Very good" },
    { min: 60, max: 69, grade: "C", comment: "Good" },
    { min: 50, max: 59, grade: "D", comment: "Fair" },
    { min: 40, max: 49, grade: "E", comment: "Below average" },
    { min: 0, max: 39, grade: "F", comment: "Fail" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!blueprint) return;
    setAdmPrefix(blueprint.admissionPrefix);
    setAdmPattern(blueprint.admissionPattern);
    setStaffPrefix(blueprint.staffPrefix);
    setStaffPattern(blueprint.staffPattern);
    setTermNaming(blueprint.termNaming);
    setTermsPerYear(blueprint.termsPerYear);
    setBands(blueprint.gradingScale.map((b) => ({ ...b })));
  }, [blueprint]);

  if (!school) return null;
  if (!isLeadership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>School Blueprint</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only the school head can change naming, terms, and grading conventions.
          </p>
        </CardContent>
      </Card>
    );
  }

  const updateBand = (i: number, patch: Partial<Band>) =>
    setBands((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  async function handleSave() {
    if (!school) return;
    setSaving(true);
    try {
      await saveBlueprint({
        schoolId: school._id,
        admissionPrefix: admPrefix,
        admissionPattern: admPattern,
        staffPrefix,
        staffPattern,
        termNaming,
        termsPerYear,
        gradingScale: bands
          .filter((b) => b.grade.trim() && b.max >= b.min)
          .map((b) => ({ min: b.min, max: b.max, grade: b.grade.trim(), comment: b.comment?.trim() || undefined })),
      });
      toast.success("School Blueprint saved. New numbers now follow your convention.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save Blueprint.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-5 w-5" /> School Blueprint
        </CardTitle>
        <CardDescription>
          Your school&apos;s own conventions — naming, terms, and grading. Everything is optional;
          defaults match today&apos;s behaviour until you change them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Naming conventions */}
        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" /> Number conventions
          </p>
          <p className="text-xs text-muted-foreground">
            Tokens: <code>{"{prefix}"}</code> <code>{"{year}"}</code> <code>{"{seq}"}</code>{" "}
            <code>{"{timestamp}"}</code> — e.g. <code>{"{prefix}-{year}-{seq}"}</code> →{" "}
            <code>ADM-2026-0001</code>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bp-adm-prefix">Admission prefix</Label>
              <Input id="bp-adm-prefix" value={admPrefix} onChange={(e) => setAdmPrefix(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bp-adm-pattern">Admission pattern</Label>
              <Input id="bp-adm-pattern" value={admPattern} onChange={(e) => setAdmPattern(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bp-staff-prefix">Staff prefix</Label>
              <Input id="bp-staff-prefix" value={staffPrefix} onChange={(e) => setStaffPrefix(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bp-staff-pattern">Staff pattern</Label>
              <Input id="bp-staff-pattern" value={staffPattern} onChange={(e) => setStaffPattern(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-muted-foreground">Next admission no:</span>
            <span className="font-mono font-medium">{nextAdm ?? "…"}</span>
            <span className="text-muted-foreground">Next staff no:</span>
            <span className="font-mono font-medium">{nextStaff ?? "…"}</span>
          </div>
        </div>

        {/* Terms */}
        <div className="space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sigma className="h-4 w-4 text-primary" /> Terms
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bp-term-naming">Term naming</Label>
              <Input
                id="bp-term-naming"
                value={termNaming}
                onChange={(e) => setTermNaming(e.target.value)}
                placeholder="Term {n}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                <code>{"{n}"}</code> becomes the number — &quot;Semester {`{n}`}&quot; works too.
              </p>
            </div>
            <div>
              <Label htmlFor="bp-terms-per-year">Terms per year</Label>
              <Input
                id="bp-terms-per-year"
                type="number"
                min={1}
                max={6}
                value={termsPerYear}
                onChange={(e) => setTermsPerYear(Number(e.target.value) || 3)}
              />
            </div>
          </div>
        </div>

        {/* Grading scale */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Grading scale</p>
          <div className="space-y-2">
            {bands.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1.4fr_auto] gap-2 items-center">
                <Input type="number" value={b.min} onChange={(e) => updateBand(i, { min: Number(e.target.value) })} placeholder="Min" />
                <Input type="number" value={b.max} onChange={(e) => updateBand(i, { max: Number(e.target.value) })} placeholder="Max" />
                <Input value={b.grade} onChange={(e) => updateBand(i, { grade: e.target.value })} placeholder="Grade" />
                <Input
                  value={b.comment ?? ""}
                  onChange={(e) => updateBand(i, { comment: e.target.value })}
                  placeholder="Comment (optional)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setBands((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove band"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBands((prev) => [...prev, { min: 0, max: 100, grade: "", comment: "" }])}
          >
            <Plus className="h-4 w-4" /> Add band
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <BrandLoader variant="dots" size="sm" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Blueprint"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
