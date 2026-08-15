"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { DoughnutChart, HorizontalBarChart, EmptyChart } from "@/components/charts";
import { Plus, TrendingDown, Receipt, Wallet, Search, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

function fmtKES(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

const CATEGORY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function ExpendituresPage() {
  const school = useSchool();
  const expenditures = useQuery(
    api.expenditures.listExpenditures,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.expenditures.getExpenditureStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createExpenditure = useMutation(api.expenditures.createExpenditure);
  const removeExpenditure = useMutation(api.expenditures.removeExpenditure);

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    category: "",
    description: "",
    amount: "",
    date: "",
    paidTo: "",
    paymentMethod: "cash" as "cash" | "bank_transfer" | "cheque" | "mobile_money" | "other",
    reference: "",
    notes: "",
  });

  const handleSubmit = async () => {
    if (!school) return;
    if (!form.category || !form.amount || !form.date) {
      toast.error("Category, amount, and date are required.");
      return;
    }
    try {
      await createExpenditure({
        schoolId: school._id,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount),
        date: new Date(form.date).getTime(),
        paidTo: form.paidTo,
        paymentMethod: form.paymentMethod,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Expenditure recorded!");
      setShowAdd(false);
      setForm({ category: "", description: "", amount: "", date: "", paidTo: "", paymentMethod: "cash", reference: "", notes: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record");
    }
  };

  const filtered = useMemo(() => {
    if (!expenditures) return [];
    if (!search) return expenditures;
    const q = search.toLowerCase();
    return expenditures.filter(
      (e) => e.category.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.paidTo.toLowerCase().includes(q)
    );
  }, [expenditures, search]);

  // Chart data
  const categoryData = useMemo(() => {
    if (!stats?.byCategory) return null;
    const entries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    return {
      labels: entries.map(([k]) => k),
      data: entries.map(([, v]) => v),
      colors: entries.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
    };
  }, [stats]);

  const totalSpent = stats?.total ?? 0;
  const txCount = stats?.count ?? 0;
  const avgPerTx = txCount > 0 ? Math.round(totalSpent / txCount) : 0;
  const topCategory = categoryData?.labels[0] ?? "—";

  if (!school) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Expenditures</h1>
          <p className="text-muted-foreground mt-1">Track spending, budgets, and financial outflows.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" /> Record Expenditure</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingDown className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{fmtKES(totalSpent)}</p>
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Receipt className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{txCount}</p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{fmtKES(avgPerTx)}</p>
              <p className="text-xs text-muted-foreground">Avg per Transaction</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-xs font-bold text-purple-600">#1</span>
            </div>
            <div>
              <p className="text-lg font-bold truncate">{topCategory}</p>
              <p className="text-xs text-muted-foreground">Top Category</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData ? (
              <DoughnutChart
                labels={categoryData.labels}
                data={categoryData.data}
              />
            ) : (
              <EmptyChart message="No expenditure data yet" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData ? (
              <HorizontalBarChart
                labels={categoryData.labels.slice(0, 8)}
                datasets={[{ label: "Amount", data: categoryData.data.slice(0, 8) }]}
              />
            ) : (
              <EmptyChart message="No expenditure data yet" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search + Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Expenditures</CardTitle>
              <CardDescription>{filtered.length} records</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!expenditures ? (
            <div className="flex justify-center py-8"><BrandLoader variant="dots" size="sm" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>{search ? "No matching expenditures" : "No expenditures recorded yet"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/5">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Date</th>
                    <th className="text-left p-2.5 font-medium">Category</th>
                    <th className="text-left p-2.5 font-medium">Description</th>
                    <th className="text-left p-2.5 font-medium">Paid To</th>
                    <th className="text-right p-2.5 font-medium">Amount</th>
                    <th className="text-left p-2.5 font-medium">Method</th>
                    <th className="text-left p-2.5 font-medium">Ref</th>
                    <th className="p-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((exp) => (
                    <tr key={exp._id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-2.5 whitespace-nowrap">{new Date(exp.date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="p-2.5"><Badge variant="secondary">{exp.category}</Badge></td>
                      <td className="p-2.5 max-w-[200px] truncate">{exp.description}</td>
                      <td className="p-2.5">{exp.paidTo}</td>
                      <td className="p-2.5 text-right font-semibold">{fmtKES(exp.amount)}</td>
                      <td className="p-2.5 capitalize">{exp.paymentMethod.replace("_", " ")}</td>
                      <td className="p-2.5 text-muted-foreground text-xs">{exp.reference ?? "—"}</td>
                      <td className="p-2.5">
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 h-7 px-2"
                          onClick={async () => {
                            if (!confirm("Delete this expenditure?")) return;
                            await removeExpenditure({ id: exp._id });
                            toast.success("Deleted");
                          }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Record Expenditure" size="lg">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category *</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Salaries, Utilities, Supplies" />
            </div>
            <div>
              <Label>Amount (KES) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Paid To</Label>
              <Input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Recipient name" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
            </div>
            <div>
              <Label>Payment Method</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as any })}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt/invoice number" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>Record Expenditure</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
