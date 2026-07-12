"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

const statusVariant: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  active: "success",
  past_due: "warning",
  cancelled: "danger",
  inactive: "secondary",
};

export default function AdminSubscriptionsPage() {
  const schools = useQuery(api.schools.list);
  const subscriptions = useQuery(api.subscriptions.list);
  const createSubscription = useMutation(api.subscriptions.create);
  const updateSubscription = useMutation(api.subscriptions.update);

  const [showModal, setShowModal] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [planType, setPlanType] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "cancelled" | "past_due">("active");

  const schoolMap = Object.fromEntries((schools ?? []).map((s) => [s._id, s.name]));

  if (subscriptions === undefined || schools === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("subscription-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!schoolId || !planType.trim()) {
      toast.error("Please fill all fields");
      return;
    }
    await createSubscription({ schoolId: schoolId as any, planType: planType.trim(), status });
    toast.success("Subscription created");
    setShowModal(false);
    setSchoolId("");
    setPlanType("");
    setStatus("active");
  }

  async function handleToggleStatus(sub: any) {
    const next = sub.status === "active" ? "inactive" : "active";
    await updateSubscription({ id: sub._id, status: next });
    toast.success(`Subscription ${next}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground mt-1">{subscriptions?.length ?? 0} subscriptions</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Subscription
        </Button>
      </div>

      <div className="space-y-2">
        {subscriptions?.map((sub) => (
          <Card key={sub._id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{schoolMap[sub.schoolId] ?? sub.schoolId}</p>
                    <p className="text-xs text-muted-foreground">Plan: {sub.planType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[sub.status] ?? "secondary"}>
                    {sub.status}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => handleToggleStatus(sub)}>
                    {sub.status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {subscriptions?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No subscriptions yet</p>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Subscription">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="school">School</Label>
            <Select id="school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select a school</option>
              {schools?.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="planType">Plan Type</Label>
            <Input id="planType" value={planType} onChange={(e) => setPlanType(e.target.value)} placeholder="e.g. basic, premium" required />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="cancelled">Cancelled</option>
              <option value="past_due">Past Due</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
