"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { useSchoolSlug } from "@/lib/use-school-slug";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, CircleDollarSign, Users, TrendingUp, AlertTriangle,
  Search, CheckCircle2, XCircle, ReceiptText, Wallet, Banknote, Download, Upload,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { toast } from "sonner";
import { FeePaymentModal } from "@/components/fee-payment-modal";
import { ImportStudio } from "@/components/import-studio";
import { exportToCsv } from "@/lib/csv-export";
import { LineChart, DoughnutChart, HorizontalBarChart, EmptyChart } from "@/components/charts";

function fmtKES(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

const METHOD_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  mpesa: Wallet,
  bank_transfer: ReceiptText,
  other: CircleDollarSign,
};

type Tab = "overview" | "structures" | "payments" | "balances";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "structures", label: "Fee Structures" },
  { key: "payments", label: "Payments" },
  { key: "balances", label: "Balances" },
];

export default function FeesPage() {
  const school = useSchool();
  const role = useRole();
  const slug = useSchoolSlug();
  const [tab, setTab] = useState<Tab>("overview");
  const [showPay, setShowPay] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [payStudentId, setPayStudentId] = useState<string | undefined>();
  const [payRefresh, setPayRefresh] = useState(0);

  const terms = useQuery(
    api.terms.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const defaultTerm = useMemo(
    () => terms?.find((t) => t.status === "active") ?? terms?.[0],
    [terms]
  );
  const [selectedTermId, setSelectedTermId] = useState<string | undefined>(
    defaultTerm?._id
  );
  const selectedTerm = terms?.find((t) => t._id === selectedTermId) ?? defaultTerm;

  const summary = useQuery(
    api.fees.getTermSummary,
    school && selectedTerm ? { schoolId: school._id, termId: selectedTerm._id } : "skip"
  );
  const structures = useQuery(
    api.fees.listStructures,
    school && selectedTerm ? { schoolId: school._id, termId: selectedTerm._id } : "skip"
  );
  const payments = useQuery(
    api.fees.listPayments,
    school && selectedTerm ? { schoolId: school._id, termId: selectedTerm._id } : "skip"
  );
  const studentFees = useQuery(
    api.fees.listStudentFeesMultiTerm,
    school ? { schoolId: school._id } : "skip"
  );
  const classes = useQuery(
    api.classes.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const removeStructure = useMutation(api.fees.removeFeeStructure);
  const [delStructId, setDelStructId] = useState<string | null>(null);

  const isLeadership = isLeadershipRole(role);

  // Leadership-gated server-side (requirePrincipal); skip for everyone else.
  const feeAnalytics = useQuery(
    api.schoolAnalytics.getFeeAnalytics,
    school && isLeadership ? { schoolId: school._id } : "skip"
  );

  // â”€â”€ Loading state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  // â”€â”€ Stats cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stats = summary
    ? [
        {
          label: "Fees Expected",
          value: fmtKES(summary.expected),
          icon: CircleDollarSign,
          color: "text-primary",
        },
        {
          label: "Collected",
          value: fmtKES(summary.collected),
          icon: TrendingUp,
          color: "text-green-600",
        },
        {
          label: "Outstanding",
          value: fmtKES(summary.outstanding),
          icon: AlertTriangle,
          color: summary.outstanding > 0 ? "text-red-600" : "text-green-600",
        },
        {
          label: "Collection Rate",
          value: `${summary.collectionRate}%`,
          icon: CheckCircle2,
          color: summary.collectionRate >= 80 ? "text-green-600" : summary.collectionRate >= 50 ? "text-yellow-600" : "text-red-600",
        },
        {
          label: "Students Owing",
          value: `${summary.debtors} / ${summary.studentCount}`,
          icon: Users,
          color: summary.debtors > 0 ? "text-orange-600" : "text-green-600",
        },
        {
          label: "Payments Recorded",
          value: summary.paymentCount.toString(),
          icon: ReceiptText,
          color: "text-blue-600",
        },
        ...(summary.schoolOwes > 0
          ? [
              {
                label: "School Owes (Credit)",
                value: fmtKES(summary.schoolOwes),
                icon: Wallet,
                color: "text-amber-600",
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">School Fees</h1>
          <p className="text-muted-foreground text-sm">
            {selectedTerm
              ? `${selectedTerm.name} ${selectedTerm.year}`
              : "Set a current term to get started"}
          </p>
        </div>
        {isLeadership && (
          <div className="flex items-center gap-2">
            <select
              value={selectedTermId ?? ""}
              onChange={(e) => setSelectedTermId(e.target.value || undefined)}
              className="flex h-10 w-[200px] rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
            >
              <option value="">Select term</option>
              {terms?.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} {t.year}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            {payments && payments.length > 0 && (
              <Button
                variant="outline"
                onClick={() =>
                  exportToCsv(
                    payments.map((p) => ({
                      Date: new Date(p.receivedAt).toISOString().slice(0, 10),
                      Student: p.studentName,
                      "Adm No": p.admNo,
                      Amount: p.amount,
                      Method: METHOD_LABELS[p.method] ?? p.method,
                      Reference: p.reference ?? "",
                    })),
                    "fee_payments"
                  )
                }
              >
                <Download className="h-4 w-4 mr-2" /> Export
              </Button>
            )}
            <Button
              onClick={() => {
                setPayStudentId(undefined);
                setShowPay(true);
              }}
            >
              <CircleDollarSign className="h-4 w-4 mr-1.5" /> Record Payment
            </Button>
          </div>
        )}
      </div>

      {!selectedTerm ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <CircleDollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg">No Active Term</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Go to <a href="/dashboard/terms" className="text-primary hover:underline">Terms</a> and set a current term first — fee structures and payments are term-based.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {summary === undefined
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <BrandLoader variant="dots" size="sm" />
                    </CardContent>
                  </Card>
                ))
              : stats.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Card key={s.label}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Icon className={`h-5 w-5 ${s.color}`} />
                        <div>
                          <p className="text-lg font-bold leading-tight">{s.value}</p>
                          <p className="text-xs text-muted-foreground">{s.label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
          </div>

          {/* â”€â”€ Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* â”€â”€ Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {tab === "overview" && (
            <div className="space-y-4">
              {summary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Collection Summary</CardTitle>
                    <CardDescription>{selectedTerm?.name} {selectedTerm?.year}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Collection progress</span>
                          <span className="font-semibold">{summary.collectionRate}%</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${Math.min(summary.collectionRate, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2">
                        <div>
                          <p className="text-muted-foreground">Expected</p>
                          <p className="font-semibold text-lg">{fmtKES(summary.expected)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Collected</p>
                          <p className="font-semibold text-lg text-green-600">{fmtKES(summary.collected)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Outstanding</p>
                          <p className={`font-semibold text-lg ${summary.outstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                            {fmtKES(summary.outstanding)}
                          </p>
                        </div>
                      </div>
                      {summary.creditApplied > 0 && (
                        <p className="text-xs text-muted-foreground pt-2 border-t border-border/60 mt-3">
                          <span className="font-medium text-primary">{fmtKES(summary.creditApplied)}</span> in overpayment
                          credit carried into this term from earlier terms.
                        </p>
                      )}
                      {summary.schoolOwes > 0 && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-amber-600 shrink-0" />
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            <span className="font-semibold">The school owes {fmtKES(summary.schoolOwes)}</span>{" "}
                            in credit from overpayments — apply it to next term&apos;s fees or refund it.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Analytics charts ── */}
              {feeAnalytics && feeAnalytics.studentCount > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Collection Trend</CardTitle>
                      <CardDescription>Weekly collections, last 12 weeks</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {feeAnalytics.trend.some((t) => t.collected > 0) ? (
                        <LineChart
                          labels={feeAnalytics.trend.map((t) => t.label)}
                          datasets={[{ label: "Collected", data: feeAnalytics.trend.map((t) => t.collected), color: "#22c55e" }]}
                          height={220}
                          showArea
                        />
                      ) : (
                        <EmptyChart message="No payments recorded this term yet" />
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Payment Methods</CardTitle>
                      <CardDescription>How fees are being paid</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {feeAnalytics.byMethod.length > 0 ? (
                        <DoughnutChart
                          labels={feeAnalytics.byMethod.map((m) => METHOD_LABELS[m.method] ?? m.method)}
                          data={feeAnalytics.byMethod.map((m) => m.amount)}
                          height={220}
                        />
                      ) : (
                        <EmptyChart message="No payments yet" />
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {feeAnalytics && feeAnalytics.byClass.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Collection by Class</CardTitle>
                    <CardDescription>Expected vs collected, current term</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HorizontalBarChart
                      labels={feeAnalytics.byClass.map((c) => c.className)}
                      datasets={[
                        { label: "Expected", data: feeAnalytics.byClass.map((c) => c.expected), color: "#94a3b8" },
                        { label: "Collected", data: feeAnalytics.byClass.map((c) => c.collected), color: "#2563eb" },
                      ]}
                      height={Math.max(160, feeAnalytics.byClass.length * 34)}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Top debtors */}
              {studentFees && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Outstanding Balances</CardTitle>
                    <CardDescription>Top 10 students with outstanding fees (all terms, credit applied)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {studentFees.filter((r) => r.totalBalance > 0).length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />
                        All fees collected — no outstanding balances!
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary/5">
                            <tr>
                              <th className="text-left p-2.5 font-medium">Student</th>
                              <th className="text-left p-2.5 font-medium">Adm No</th>
                              <th className="text-right p-2.5 font-medium">Expected</th>
                              <th className="text-right p-2.5 font-medium">Paid</th>
                              <th className="text-right p-2.5 font-medium">Balance</th>
                              <th className="text-right p-2.5 font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentFees
                              .filter((r) => r.totalBalance > 0)
                              .slice(0, 10)
                              .map((r) => (
                                <tr key={r.student._id} className="border-t border-border">
                                  <td className="p-2.5 font-medium">
                                    {r.student.firstName} {r.student.lastName}
                                  </td>
                                  <td className="p-2.5 text-muted-foreground">{r.student.admNo}</td>
                                  <td className="p-2.5 text-right">{fmtKES(r.totalExpected)}</td>
                                  <td className="p-2.5 text-right">{fmtKES(r.totalPaid)}</td>
                                  <td className="p-2.5 text-right font-semibold text-red-600">
                                    {fmtKES(r.totalBalance)}
                                  </td>
                                  <td className="p-2.5 text-right">
                                    {isLeadership && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setPayStudentId(r.student._id);
                                          setShowPay(true);
                                        }}
                                      >
                                        <CircleDollarSign className="h-3.5 w-3.5 mr-1" /> Pay
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* â”€â”€ Structures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {tab === "structures" && (
            <StructuresTab
              schoolId={school._id}
              termId={selectedTerm!._id}
              classes={classes ?? []}
              structures={structures}
              isLeadership={isLeadership}
            />
          )}

          {/* â”€â”€ Payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {tab === "payments" && (
            <PaymentsTab payments={payments} />
          )}

          {/* â”€â”€ Balances â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {tab === "balances" && (
            <BalancesTab
              studentFees={studentFees}
              isLeadership={isLeadership}
              onPay={(sid) => {
                setPayStudentId(sid);
                setShowPay(true);
              }}
            />
          )}
        </>
      )}

      {/* â”€â”€ Payment modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <FeePaymentModal
        open={showPay}
        onClose={() => {
          setShowPay(false);
          setPayStudentId(undefined);
        }}
        studentId={payStudentId}
        onPaid={() => setPayRefresh((n) => n + 1)}
      />

      <ImportStudio open={showImport} onClose={() => setShowImport(false)} />

      {/* â”€â”€ Delete structure confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        open={!!delStructId}
        onClose={() => setDelStructId(null)}
        title="Remove Fee Structure"
      >
        <p className="text-sm text-muted-foreground mb-4">
          This will remove the fee amount for this class. Students will show &quot;No fee structure&quot; for this term. Continue?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDelStructId(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!delStructId) return;
              try {
                await removeStructure({ id: delStructId as any });
                toast.success("Fee structure removed");
                setDelStructId(null);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// â”€â”€ Structures Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StructuresTab({
  schoolId,
  termId,
  classes,
  structures,
  isLeadership,
}: {
  schoolId: string;
  termId: string;
  classes: Array<{ _id: string; name: string; hasStreams: boolean }>;
  structures: Array<{
    _id: string;
    classId: string;
    streamId?: string | undefined;
    amount: number;
    className: string;
    streamName: string | null;
  }> | undefined;
  isLeadership: boolean;
}) {
  const setStructure = useMutation(api.fees.setFeeStructure);
  const [showAdd, setShowAdd] = useState(false);
  const [clsId, setClsId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const streams = useQuery(
    api.streams.listByClass,
    clsId ? { classId: clsId as any } : "skip"
  );
  const selectedClass = classes.find((c) => c._id === clsId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await setStructure({
        schoolId: schoolId as any,
        classId: clsId as any,
        termId: termId as any,
        streamId: streamId ? (streamId as any) : undefined,
        amount: amt,
      });
      toast.success("Fee structure saved");
      setShowAdd(false);
      setClsId("");
      setStreamId("");
      setAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fee Structures</h3>
        {isLeadership && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Set Fee
          </Button>
        )}
      </div>

      {structures === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : structures.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            No fee structures set for this term. Click &quot;Set Fee&quot; to define what each class pays.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-2.5 font-medium">Class</th>
                <th className="text-left p-2.5 font-medium">Stream</th>
                <th className="text-right p-2.5 font-medium">Amount (KES)</th>
                {isLeadership && <th className="text-right p-2.5 font-medium w-12"></th>}
              </tr>
            </thead>
            <tbody>
              {structures.map((st) => (
                <tr key={st._id} className="border-t border-border">
                  <td className="p-2.5 font-medium">{st.className}</td>
                  <td className="p-2.5 text-muted-foreground">{st.streamName ?? "All streams"}</td>
                  <td className="p-2.5 text-right font-semibold">{fmtKES(st.amount)}</td>
                  {isLeadership && (
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => (window as any).__delStructId = st._id}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add structure modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Set Fee Structure">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <Label>Class *</Label>
            <Select value={clsId} onChange={(e) => { setClsId(e.target.value); setStreamId(""); }} required>
              <option value="">Select a class</option>
              {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </Select>
          </div>
          {selectedClass?.hasStreams && streams && streams.length > 0 && (
            <div>
              <Label>Stream (optional — leave blank for all streams)</Label>
              <Select value={streamId} onChange={(e) => setStreamId(e.target.value)}>
                <option value="">All streams</option>
                {streams.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label>Amount (KES) *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 15000"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <BrandLoader variant="dots" size="sm" />}
              Save Structure
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// â”€â”€ Payments Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PaymentsTab({
  payments,
}: {
  payments: Array<{
    _id: string;
    studentId: string;
    amount: number;
    method: string;
    reference?: string;
    note?: string;
    receivedAt: number;
    studentName: string;
    admNo: string;
  }> | undefined;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!payments) return [];
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.studentName.toLowerCase().includes(q) ||
        p.admNo.toLowerCase().includes(q)
    );
  }, [payments, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Payment History</h3>
        {payments && payments.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student or adm noâ€¦"
              className="pl-10 w-64"
            />
          </div>
        )}
      </div>

      {payments === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {payments.length === 0
              ? "No payments recorded yet this term."
              : "No payments match your search."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-2.5 font-medium">Student</th>
                <th className="text-left p-2.5 font-medium">Adm No</th>
                <th className="text-right p-2.5 font-medium">Amount</th>
                <th className="text-left p-2.5 font-medium">Method</th>
                <th className="text-left p-2.5 font-medium">Reference</th>
                <th className="text-left p-2.5 font-medium">Note</th>
                <th className="text-left p-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const MethodIcon = METHOD_ICONS[p.method] ?? CircleDollarSign;
                return (
                  <tr key={p._id} className="border-t border-border">
                    <td className="p-2.5 font-medium">{p.studentName}</td>
                    <td className="p-2.5 text-muted-foreground">{p.admNo}</td>
                    <td className="p-2.5 text-right font-semibold text-green-600">{fmtKES(p.amount)}</td>
                    <td className="p-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-secondary/50 rounded-full px-2.5 py-1">
                        <MethodIcon className="h-3 w-3" />
                        {METHOD_LABELS[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground text-xs">{p.reference ?? ""}</td>
                    <td className="p-2.5 text-muted-foreground text-xs">{p.note ?? ""}</td>
                    <td className="p-2.5 text-muted-foreground text-xs">
                      {new Date(p.receivedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Balances Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type StudentFeeRow = {
  student: { _id: string; firstName: string; lastName: string; admNo: string; classId: string };
  totalExpected: number;
  totalPaid: number;
  totalBalance: number;
  schoolOwes: number;
  fullyCleared: boolean;
  terms: Array<{
    termId: string;
    termName: string;
    termYear: number;
    expected: number;
    creditFromPrior: number;
    effectiveExpected: number;
    paid: number;
    balance: number;
    credit: number;
    status: "cleared" | "owing" | "overpaid" | "no_structure";
  }>;
};

function TermStatusBadge({ status }: { status: StudentFeeRow["terms"][number]["status"] }) {
  if (status === "no_structure") return <Badge variant="secondary">No fee</Badge>;
  if (status === "overpaid")
    return (
      <Badge variant="warning">
        <span className="inline-flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Overpaid
        </span>
      </Badge>
    );
  if (status === "cleared")
    return (
      <Badge variant="success">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Cleared
        </span>
      </Badge>
    );
  return <Badge variant="danger">Owing</Badge>;
}

function BalancesTab({
  studentFees,
  isLeadership,
  onPay,
}: {
  studentFees: StudentFeeRow[] | undefined;
  isLeadership: boolean;
  onPay: (studentId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "owing" | "paid" | "overpaid" | "no_structure">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    if (!studentFees) return [];
    let list = studentFees;
    if (filter === "owing") list = list.filter((r) => r.totalBalance > 0);
    else if (filter === "paid") list = list.filter((r) => r.totalBalance === 0 && r.totalExpected > 0);
    else if (filter === "overpaid") list = list.filter((r) => r.totalBalance < 0);
    else if (filter === "no_structure") list = list.filter((r) => r.totalExpected === 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(q) ||
          r.student.admNo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [studentFees, search, filter]);

  const owing = studentFees?.filter((r) => r.totalBalance > 0).length ?? 0;
  const paidUp = studentFees?.filter((r) => r.totalBalance === 0 && r.totalExpected > 0).length ?? 0;
  const overpaid = studentFees?.filter((r) => r.totalBalance < 0).length ?? 0;
  const noStruct = studentFees?.filter((r) => r.totalExpected === 0).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Student Balances</h3>
          <p className="text-xs text-muted-foreground">
            All terms, with credit carried forward. A negative balance means the school owes the student.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search studentâ€¦"
              className="pl-10 w-56"
            />
          </div>
          <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
            {([
              ["all", `All (${studentFees?.length ?? 0})`],
              ["owing", `Owing (${owing})`],
              ["paid", `Paid (${paidUp})`],
              ["overpaid", `Overpaid (${overpaid})`],
              ["no_structure", `No fee (${noStruct})`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filter === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {studentFees === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {studentFees.length === 0 ? "No student data available." : "No students match."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/5">
              <tr>
                <th className="text-left p-2.5 font-medium w-8"></th>
                <th className="text-left p-2.5 font-medium">Student</th>
                <th className="text-left p-2.5 font-medium">Adm No</th>
                <th className="text-right p-2.5 font-medium">Total Expected</th>
                <th className="text-right p-2.5 font-medium">Total Paid</th>
                <th className="text-right p-2.5 font-medium">Balance</th>
                <th className="text-right p-2.5 font-medium">Status</th>
                {isLeadership && <th className="text-right p-2.5 font-medium w-20">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = !!expanded[r.student._id];
                const status =
                  r.totalExpected === 0
                    ? "no_structure"
                    : r.totalBalance > 0
                    ? "owing"
                    : r.totalBalance < 0
                    ? "overpaid"
                    : "cleared";
                return (
                  <Fragment key={r.student._id}>
                    <tr className="border-t border-border hover:bg-secondary/5 transition-colors">
                      <td className="p-2.5">
                        <button
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [r.student._id]: !isOpen }))
                          }
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          title={isOpen ? "Collapse" : "Show per-term breakdown"}
                        >
                          <svg
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>
                      <td className="p-2.5 font-medium">
                        <a href={`/dashboard/students?view=${r.student._id}`} className="hover:text-primary hover:underline">
                          {r.student.firstName} {r.student.lastName}
                        </a>
                      </td>
                      <td className="p-2.5 text-muted-foreground">{r.student.admNo}</td>
                      <td className="p-2.5 text-right">{r.totalExpected > 0 ? fmtKES(r.totalExpected) : ""}</td>
                      <td className="p-2.5 text-right">{fmtKES(r.totalPaid)}</td>
                      <td className={`p-2.5 text-right font-semibold ${r.totalBalance > 0 ? "text-red-600" : r.totalBalance < 0 ? "text-amber-600" : "text-green-600"}`}>
                        {r.totalExpected > 0 ? (r.totalBalance < 0 ? `-${fmtKES(Math.abs(r.totalBalance))}` : fmtKES(r.totalBalance)) : ""}
                      </td>
                      <td className="p-2.5 text-right">
                        {status === "no_structure" && <Badge variant="secondary">No fee</Badge>}
                        {status === "owing" && <Badge variant="danger">Owing</Badge>}
                        {status === "cleared" && (
                          <Badge variant="success">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Paid
                            </span>
                          </Badge>
                        )}
                        {status === "overpaid" && (
                          <Badge variant="warning">
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              School owes {fmtKES(Math.abs(r.totalBalance))}
                            </span>
                          </Badge>
                        )}
                      </td>
                      {isLeadership && (
                        <td className="p-2.5 text-right">
                          {r.totalExpected > 0 && r.totalBalance > 0 && (
                            <Button variant="outline" size="sm" onClick={() => onPay(r.student._id)}>
                              Pay
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-border bg-secondary/5">
                        <td className="p-0" colSpan={8}>
                          <div className="p-3 pl-12">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left p-2 font-medium">Term</th>
                                  <th className="text-right p-2 font-medium">Expected</th>
                                  <th className="text-right p-2 font-medium">Credit used</th>
                                  <th className="text-right p-2 font-medium">Paid</th>
                                  <th className="text-right p-2 font-medium">Balance</th>
                                  <th className="text-right p-2 font-medium">Credit fwd</th>
                                  <th className="text-right p-2 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.terms.map((t) => (
                                  <tr key={t.termId} className="border-t border-border/60">
                                    <td className="p-2 font-medium">{t.termName} {t.termYear}</td>
                                    <td className="p-2 text-right">{t.expected > 0 ? fmtKES(t.expected) : ""}</td>
                                    <td className="p-2 text-right">{t.creditFromPrior > 0 ? fmtKES(t.creditFromPrior) : ""}</td>
                                    <td className="p-2 text-right">{t.paid > 0 ? fmtKES(t.paid) : ""}</td>
                                    <td className={`p-2 text-right font-medium ${t.status === "owing" ? "text-red-600" : t.status === "overpaid" ? "text-amber-600" : "text-green-600"}`}>
                                      {t.expected > 0 ? (t.balance < 0 ? `-${fmtKES(Math.abs(t.balance))}` : fmtKES(t.balance)) : ""}
                                    </td>
                                    <td className="p-2 text-right">{t.credit > 0 ? fmtKES(t.credit) : ""}</td>
                                    <td className="p-2 text-right"><TermStatusBadge status={t.status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

