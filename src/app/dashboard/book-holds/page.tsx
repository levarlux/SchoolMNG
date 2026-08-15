"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookMarked, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: typeof Clock }> = {
  pending: { label: "Pending", variant: "warning", icon: Clock },
  ready: { label: "Ready", variant: "success", icon: CheckCircle2 },
  fulfilled: { label: "Fulfilled", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "secondary", icon: XCircle },
};

export default function BookHoldsPage() {
  const school = useSchool();
  const holds = useQuery(
    api.bookHolds.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const updateStatus = useMutation(api.bookHolds.updateStatus);

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Book Holds</h1>
        <p className="text-muted-foreground text-sm">Library book reservations</p>
      </div>

      {holds === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : holds.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <BookMarked className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No book holds yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {holds.map((h) => {
            const config = STATUS_CONFIG[h.status];
            const Icon = config?.icon ?? Clock;
            return (
              <Card key={h._id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Book #{h.bookId}</p>
                      <p className="text-xs text-muted-foreground">Student #{h.studentId}</p>
                      <p className="text-xs text-muted-foreground">Requested: {formatDate(h.requestedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={config?.variant as any}>{config?.label}</Badge>
                    {h.status === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try { await updateStatus({ id: h._id, status: "ready" }); toast.success("Marked ready"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                          }}
                        >
                          Mark Ready
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={async () => {
                            try { await updateStatus({ id: h._id, status: "cancelled" }); toast.success("Cancelled"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                    {h.status === "ready" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try { await updateStatus({ id: h._id, status: "fulfilled" }); toast.success("Fulfilled"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}
                      >
                        Fulfilled
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
