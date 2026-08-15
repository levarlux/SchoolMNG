"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Sparkles, AlertTriangle, CheckCircle2, Search, DollarSign, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

const statusVariant: Record<string, "success" | "warning" | "danger" | "secondary"> = {
  active: "success",
  trial: "warning",
  past_due: "warning",
  cancelled: "danger",
  inactive: "secondary",
  expired: "danger",
};

const statusLabel: Record<string, string> = {
  active: "Active",
  trial: "Free Trial",
  past_due: "Past Due",
  cancelled: "Cancelled",
  inactive: "Inactive",
  expired: "Expired",
};

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminSubscriptionsPage() {
  const schools = useQuery(api.schools.list);
  const subscriptions = useQuery(api.subscriptions.list);
  const createSubscription = useMutation(api.subscriptions.create);
  const updateSubscription = useMutation(api.subscriptions.update);

  const [showModal, setShowModal] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [planType, setPlanType] = useState("");
  const [status, setStatus] = useState<"active" | "expired" | "cancelled" | "past_due" | "trial">("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const schoolMap = useMemo(
    () => Object.fromEntries((schools ?? []).map((s) => [s._id, s.name])),
    [schools],
  );

  const filteredSubs = useMemo(() => {
    if (!subscriptions) return [];
    if (!search.trim()) return subscriptions;
    const q = search.toLowerCase();
    return subscriptions.filter((sub) => {
      const schoolName = (schoolMap[sub.schoolId] ?? sub.schoolId).toLowerCase();
      return (
        schoolName.includes(q) ||
        sub.planType.toLowerCase().includes(q) ||
        sub.status.toLowerCase().includes(q)
      );
    });
  }, [subscriptions, schoolMap, search]);

  const stats = useMemo(() => {
    if (!subscriptions) return { total: 0, active: 0, trial: 0, revenue: 0 };
    return {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === "active").length,
      trial: subscriptions.filter((s) => s.status === "trial").length,
      revenue: subscriptions.filter((s) => s.status === "active").reduce((sum, s) => sum + ((s as any).amount || 0), 0),
    };
  }, [subscriptions]);

  if (subscriptions === undefined || schools === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
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
    setLoading(true);
    try {
      await createSubscription({ schoolId: schoolId as any, planType: planType.trim(), status });
      toast.success("Subscription created");
      setShowModal(false);
      setSchoolId("");
      setPlanType("");
      setStatus("active");
    } catch (err) {
      toast.error("Failed to create subscription");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(sub: any) {
    const next = sub.status === "active" ? "expired" : "active";
    try {
      await updateSubscription({ id: sub._id, status: next });
      toast.success(`Subscription ${next}`);
    } catch (err) {
      toast.error("Failed to update subscription");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage school subscriptions and billing
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Subscription
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <CreditCard className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Sparkles className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.trial}</p>
                <p className="text-xs text-muted-foreground">Trials</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">KES {stats.revenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Monthly Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by school, plan, or status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">School</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Plan</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">Amount</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">Last Payment</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{search ? "No subscriptions match" : "No subscriptions yet"}</p>
                    </td>
                  </tr>
                ) : (
                  filteredSubs.map((sub) => (
                    <tr key={sub._id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {(schoolMap[sub.schoolId] ?? "S").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{schoolMap[sub.schoolId] ?? sub.schoolId}</p>
                            <p className="text-xs text-muted-foreground">ID: {sub._id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="capitalize">{sub.planType}</Badge>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <p className="text-sm font-medium">
                          {(sub as any).amount ? `KES ${(sub as any).amount.toLocaleString()}` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">/month</p>
                      </td>
                      <td className="p-4">
                        <Badge variant={statusVariant[sub.status] ?? "secondary"}>
                          {sub.status === "trial" && <Sparkles className="h-3 w-3 mr-1" />}
                          {statusLabel[sub.status] ?? sub.status}
                        </Badge>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <p className="text-sm text-muted-foreground">
                          {(sub as any).lastPaymentAt
                            ? formatDate((sub as any).lastPaymentAt)
                            : "No payments yet"}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleStatus(sub)}
                        >
                          {sub.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Subscription">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label>School</Label>
            <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select a school</option>
              {schools.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Plan Type</Label>
            <Input
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
              placeholder="e.g. starter, professional, enterprise"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="past_due">Past Due</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
              {loading ? "Creating..." : "Create Subscription"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
