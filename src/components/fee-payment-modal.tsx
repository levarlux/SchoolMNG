"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

/**
 * Shared "Record Payment" modal for the School Fees module. Used from the
 * fees page (searchable student picker) and the student profile (preset).
 */
export function FeePaymentModal({
  open,
  onClose,
  studentId,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  studentId?: string;
  onPaid?: () => void;
}) {
  const school = useSchool();
  const currentTerm = useQuery(api.terms.getCurrent, school ? { schoolId: school._id } : "skip");
  const terms = useQuery(api.terms.listBySchool, school ? { schoolId: school._id } : "skip");
  const recordPayment = useMutation(api.fees.recordPayment);

  const [selectedId, setSelectedId] = useState<string>(studentId ?? "");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [termId, setTermId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedId(studentId ?? "");
  }, [studentId, open]);

  useEffect(() => {
    if (!termId && currentTerm) setTermId(currentTerm._id);
  }, [currentTerm, termId, open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const searchResults = useQuery(
    api.students.search,
    school && !selectedId && debounced.length > 0 ? { schoolId: school._id, query: debounced } : "skip"
  );
  const selectedStudent = useQuery(
    api.students.get,
    selectedId ? { id: selectedId as any } : "skip"
  );
  // Live fee position (credit carry-over applied) so the cashier sees the
  // student's real outstanding / credit balance before recording a payment.
  const selectedFees = useQuery(
    api.fees.getStudentFees,
    selectedId ? { studentId: selectedId as any } : "skip"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !selectedId) {
      toast.error("Select a student first");
      return;
    }
    if (!termId) {
      toast.error("Select a term");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await recordPayment({
        studentId: selectedId as any,
        termId: termId as any,
        amount: amt,
        method: method as any,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Payment recorded");
      onPaid?.();
      onClose();
      setAmount("");
      setReference("");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Fee Payment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Student</Label>
          {studentId ? (
            <div className="flex items-center justify-between mt-1.5 p-3 rounded-lg border border-border bg-secondary/5">
              <span className="font-medium text-sm">
                {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} (${selectedStudent.admNo})` : "Loading…"}
              </span>
            </div>
          ) : selectedId ? (
            <div className="flex items-center justify-between mt-1.5 p-3 rounded-lg border border-border bg-secondary/5">
              <span className="font-medium text-sm">
                {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} (${selectedStudent.admNo})` : "Loading…"}
              </span>
              <button
                type="button"
                onClick={() => setSelectedId("")}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, adm no, or phone…"
                className="pl-10"
              />
              {debounced.length > 0 && (
                <div className="absolute top-11 left-0 right-0 z-20 bg-card border border-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                  {searchResults === undefined ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <BrandLoader variant="dots" size="sm" /> Searching…
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => {
                          setSelectedId(s._id);
                          setSearch("");
                          setDebounced("");
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/10 flex items-center justify-between"
                      >
                        <span className="font-medium">{s.firstName} {s.lastName}</span>
                        <span className="text-xs text-muted-foreground">{s.admNo}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground text-center">No students match</div>
                  )}
                </div>
              )}
            </div>
          )}
          {selectedFees && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-secondary/5 p-2.5">
                <p className="text-muted-foreground">Expected ({selectedFees.term.name})</p>
                <p className="font-semibold mt-0.5">KES {selectedFees.expected.toLocaleString("en-KE")}</p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/5 p-2.5">
                <p className="text-muted-foreground">Paid</p>
                <p className="font-semibold mt-0.5 text-green-600">KES {selectedFees.paid.toLocaleString("en-KE")}</p>
              </div>
              <div className={`rounded-lg border p-2.5 ${selectedFees.balance > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/30" : selectedFees.balance < 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-950/30" : "border-green-200 bg-green-50 dark:bg-green-950/30"}`}>
                <p className="text-muted-foreground">
                  {selectedFees.balance > 0 ? "Outstanding" : selectedFees.balance < 0 ? "School owes" : "Balance"}
                </p>
                <p className={`font-semibold mt-0.5 ${selectedFees.balance > 0 ? "text-red-600" : selectedFees.balance < 0 ? "text-amber-600" : "text-green-600"}`}>
                  KES {Math.abs(selectedFees.balance).toLocaleString("en-KE")}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="term">Term</Label>
            <Select id="term" value={termId} onChange={(e) => setTermId(e.target.value)} required>
              {terms === undefined ? (
                <option value="">Loading terms…</option>
              ) : (
                <>
                  <option value="">Select a term</option>
                  {terms.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} {t.year}{t.status === "active" ? " (current)" : ""}
                    </option>
                  ))}
                </>
              )}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Overpayments carry forward as credit into the next term automatically.
            </p>
          </div>
          <div>
            <Label htmlFor="method">Payment Method</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Amount (KES)</Label>
            <Input id="amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 15000" required />
          </div>
          <div>
            <Label htmlFor="reference">Reference (optional)</Label>
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. M-Pesa code, receipt no" />
          </div>
        </div>
        <div>
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. partial payment for Term 1" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving && <BrandLoader variant="dots" size="sm" className="mr-2" />}
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
