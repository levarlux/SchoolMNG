"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Wallet, Users, Briefcase, Banknote, PlayCircle, Save, TrendingUp } from "lucide-react";
import { toast } from "sonner";

function fmtKES(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

export default function PayrollPage() {
  const school = useSchool();
  const payroll = useQuery(
    api.payroll.getPayroll,
    school ? { schoolId: school._id } : "skip"
  );
  const setSalary = useMutation(api.payroll.setSalary);
  const runPayroll = useMutation(api.payroll.runPayroll);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showRun, setShowRun] = useState(false);
  const [monthLabel, setMonthLabel] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const rows = useMemo(() => payroll?.rows ?? [], [payroll]);
  const draftDiff = useMemo(() => {
    const changed: string[] = [];
    for (const r of rows) {
      const draft = drafts[r.staffId];
      if (draft !== undefined && parseFloat(draft) !== r.salary) changed.push(r.staffId);
    }
    return changed;
  }, [rows, drafts]);

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }
  const schoolId = school._id;

  async function handleSaveSalary(staffId: string) {
    const value = drafts[staffId];
    if (value === undefined) return;
    const amt = parseFloat(value);
    if (isNaN(amt) || amt < 0) {
      toast.error("Enter a valid salary amount");
      return;
    }
    setSavingId(staffId);
    try {
      await setSalary({ schoolId, staffId: staffId as any, salary: amt });
      toast.success("Salary updated");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[staffId];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save salary");
    } finally {
      setSavingId(null);
    }
  }

  async function handleRunPayroll() {
    if (!monthLabel.trim()) {
      toast.error("Enter the pay period");
      return;
    }
    setRunning(true);
    try {
      const res = await runPayroll({ schoolId, monthLabel: monthLabel.trim() });
      toast.success(
        res.count > 0
          ? `Payroll run complete — ${res.count} staff paid, ${fmtKES(res.total)}`
          : "No staff have salaries set yet. Set salaries first."
      );
      setShowRun(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run payroll");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Set staff salaries and run monthly payroll. Payroll posts to Expenditures as &quot;Salaries&quot;.
          </p>
        </div>
        <Button onClick={() => setShowRun(true)} disabled={rows.length === 0}>
          <PlayCircle className="h-4 w-4 mr-1.5" /> Run Payroll
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
              <Banknote className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{fmtKES(payroll?.totalMonthly ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Monthly total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{payroll?.staffCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">All staff</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{payroll?.teachingCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Teaching</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{payroll?.nonTeachingCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Non-teaching</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Salaries table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Staff Salaries
          </CardTitle>
          <CardDescription>
            Enter a monthly salary for each staff member. {draftDiff.length > 0 && (
              <span className="text-primary font-medium">({draftDiff.length} unsaved change{draftDiff.length > 1 ? "s" : ""})</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payroll === undefined ? (
            <div className="flex items-center justify-center p-8">
              <BrandLoader variant="book" size="md" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No staff members yet. Add staff under Teachers &amp; Staff first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Staff</th>
                    <th className="text-left p-2.5 font-medium">Staff No</th>
                    <th className="text-left p-2.5 font-medium">Department</th>
                    <th className="text-left p-2.5 font-medium">Category</th>
                    <th className="text-right p-2.5 font-medium">Monthly Salary (KES)</th>
                    <th className="text-right p-2.5 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const draft = drafts[r.staffId];
                    const dirty = draft !== undefined && parseFloat(draft) !== r.salary;
                    const value = draft ?? String(r.salary || "");
                    return (
                      <tr key={r.staffId} className="border-t border-border hover:bg-secondary/5 transition-colors">
                        <td className="p-2.5 font-medium">{r.firstName} {r.lastName}</td>
                        <td className="p-2.5 text-muted-foreground">{r.staffNo}</td>
                        <td className="p-2.5 text-muted-foreground">{r.department || "—"}</td>
                        <td className="p-2.5">
                          <Badge variant={r.category === "non_teaching" ? "secondary" : "default"}>
                            {r.category === "non_teaching" ? "Non-teaching" : "Teaching"}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={value}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [r.staffId]: e.target.value }))}
                            className="w-40 ml-auto text-right"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          {dirty && (
                            <Button size="sm" onClick={() => handleSaveSalary(r.staffId)} disabled={savingId === r.staffId}>
                              {savingId === r.staffId ? <BrandLoader variant="dots" size="sm" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                              Save
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Run payroll modal */}
      <Modal open={showRun} onClose={() => setShowRun(false)} title="Run Payroll">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This posts one <strong>Salary</strong> expenditure per staff member with a salary set. A total of{" "}
            <strong>{fmtKES(payroll?.totalMonthly ?? 0)}</strong> will be recorded for the period.
          </p>
          <div>
            <label className="text-sm font-medium">Pay period</label>
            <Input
              value={monthLabel}
              onChange={(e) => setMonthLabel(e.target.value)}
              placeholder="e.g. May 2026"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowRun(false)}>Cancel</Button>
            <Button onClick={handleRunPayroll} disabled={running}>
              {running && <BrandLoader variant="dots" size="sm" className="mr-2" />}
              Confirm Payroll Run
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
