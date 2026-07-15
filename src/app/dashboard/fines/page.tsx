"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, CircleDollarSign, CheckCircle2, XCircle, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { checkRateLimit } from "@/lib/rate-limit";

export default function FinesPage() {
  const school = useSchool();
  const fines = useQuery(api.fines.listBySchool, school ? { schoolId: school._id } : "skip");
  const markWaived = useMutation(api.fines.markWaived);

  const [search, setSearch] = useState("");

  if (fines === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = fines?.filter(
    (f) => f.reason.toLowerCase().includes(search.toLowerCase())
  );

  async function handleMarkWaived(id: string) {
    if (!confirm("Waive this fine?")) return;
    if (!checkRateLimit("fine-waive", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    try {
      await markWaived({ id: id as any, waivedBy: "admin" });
      toast.success("Fine waived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[fines.markWaived]", error);
    }
  }

  const totalUnpaid = fines
    ?.filter((f) => f.status === "unpaid")
    .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fines</h1>
          <p className="text-muted-foreground mt-1">
            Track fines for overdue or damaged books
            {totalUnpaid !== undefined && totalUnpaid > 0 && (
              <span className="ml-2 text-orange-600 font-medium">
                (KES {totalUnpaid.toLocaleString("en-KE")} unpaid)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fines && fines.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  fines.map((f) => ({
                    Reason: f.reason,
                    Amount: f.amount,
                    "Paid Amount": f.paidAmount,
                    Status: f.status,
                    Note: f.note ?? "",
                    Created: new Date(f._creationTime).toLocaleDateString(),
                  })),
                  "fines"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search fines by reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid gap-3">
        {filtered?.map((fine) => (
          <Card key={fine._id} className="border-l-2 border-l-secondary">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate capitalize">{fine.reason}</div>
                {fine.note && (
                  <div className="text-sm text-muted-foreground truncate">{fine.note}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Created {new Date(fine._creationTime).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold">KES {fine.amount.toLocaleString("en-KE")}</div>
                  {fine.paidAmount > 0 && (
                    <div className="text-xs text-green-600">
                      KES {fine.paidAmount.toLocaleString("en-KE")} paid
                    </div>
                  )}
                </div>
                <Badge
                  variant={
                    fine.status === "paid"
                      ? "success"
                      : fine.status === "waived"
                      ? "secondary"
                      : "danger"
                  }
                >
                  {fine.status}
                </Badge>
                {fine.status === "unpaid" && (
                  <Button size="sm" variant="ghost" onClick={() => handleMarkWaived(fine._id)}>
                    <XCircle className="h-4 w-4 text-orange-600" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CircleDollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No fines found</p>
          </div>
        )}
      </div>
    </div>
  );
}
