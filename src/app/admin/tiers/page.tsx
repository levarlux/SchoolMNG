"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { exportToCsv } from "@/lib/csv-export";
import {
  Crown, Search, TrendingUp, Users, CreditCard,
  AlertTriangle, CheckCircle2, Sparkles, ShieldOff, ShieldCheck, Undo2,
  ArrowUp, ArrowDown, Zap, Star, Building2,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { toast } from "sonner";

// Fallback prices (used until live prices are fetched from Paystack)
const TIER_FALLBACKS: Record<string, number> = {
  starter: 7000,
  professional: 22000,
  enterprise: 175000,
};

// Static tier styling (icons, colors, gradients)
const TIER_STYLES = {
  starter: {
    icon: Zap,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    gradient: "from-emerald-500 to-green-600",
  },
  professional: {
    icon: Star,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    gradient: "from-blue-500 to-indigo-600",
  },
  enterprise: {
    icon: Building2,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    badge: "bg-purple-100 text-purple-700",
    gradient: "from-purple-500 to-violet-600",
  },
} as const;

const TIER_NAMES: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Active", color: "text-green-600", icon: CheckCircle2 },
  trial: { label: "Trial", color: "text-yellow-600", icon: Sparkles },
  expired: { label: "Expired", color: "text-red-600", icon: AlertTriangle },
  cancelled: { label: "Cancelled", color: "text-gray-600", icon: AlertTriangle },
  past_due: { label: "Past Due", color: "text-orange-600", icon: AlertTriangle },
  no_subscription: { label: "No Sub", color: "text-gray-400", icon: AlertTriangle },
};

function formatCurrency(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

export default function AdminTiersPage() {
  const data = useQuery(api.admin.getTierDistribution);
  const trends = useQuery(api.admin.getTierTrends);
  const overrideHistory = useQuery(api.admin.getOverrideHistory);
  const overrideTier = useMutation(api.admin.overrideTier);
  const clearTierOverride = useMutation(api.admin.clearTierOverride);
  const fetchAllPlans = useAction(api.billing.getAllTierPlans);

  // Live prices fetched from Paystack (falls back to TIER_FALLBACKS if API fails)
  const [livePrices, setLivePrices] = useState<Record<string, number>>(TIER_FALLBACKS);

  useEffect(() => {
    fetchAllPlans()
      .then((plans) => {
        const prices: Record<string, number> = { ...TIER_FALLBACKS };
        plans.forEach((p) => { prices[p.tier] = p.amount; });
        setLivePrices(prices);
      })
      .catch(() => { /* keep fallbacks */ });
  }, [fetchAllPlans]);

  // Merged config: live prices + static styling
  const TIER_CONFIG = useMemo(() => ({
    starter: { name: TIER_NAMES.starter, price: livePrices.starter, ...TIER_STYLES.starter },
    professional: { name: TIER_NAMES.professional, price: livePrices.professional, ...TIER_STYLES.professional },
    enterprise: { name: TIER_NAMES.enterprise, price: livePrices.enterprise, ...TIER_STYLES.enterprise },
  }), [livePrices]);

  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [overrideModal, setOverrideModal] = useState<{
    schoolId: string;
    schoolName: string;
    currentTier: string | null;
    overriddenTier: string | null;
  } | null>(null);
  const [overrideTierValue, setOverrideTierValue] = useState<"starter" | "professional" | "enterprise">("professional");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);

  const filteredSchools = useMemo(() => {
    if (!data) return [];
    let list = data.schools;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.schoolName.toLowerCase().includes(q));
    }
    if (filterTier) list = list.filter((s) => s.tier === filterTier);
    if (filterStatus) list = list.filter((s) => s.status === filterStatus);

    return list.sort((a, b) => (b.tierScore ?? 0) - (a.tierScore ?? 0));
  }, [data, search, filterTier, filterStatus]);

  async function handleOverride() {
    if (!overrideModal) return;
    setOverrideLoading(true);
    try {
      await overrideTier({
        schoolId: overrideModal.schoolId as any,
        tier: overrideTierValue,
        reason: overrideReason.trim() || undefined,
      });
      toast.success(`Tier overridden to ${TIER_CONFIG[overrideTierValue].name}`);
      setOverrideModal(null);
      setOverrideReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to override tier");
    } finally {
      setOverrideLoading(false);
    }
  }

  async function handleClearOverride(schoolId: string) {
    try {
      await clearTierOverride({ schoolId: schoolId as any });
      toast.success("Override cleared — reverted to AI recommendation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear override");
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const maxTierCount = Math.max(data.tierCounts.starter, data.tierCounts.professional, data.tierCounts.enterprise, 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tier Distribution</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-assigned plan tiers across all schools
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const rows = data.schools.map((s) => ({
              "School Name": s.schoolName,
              "AI Tier": s.tier ?? "",
              "Override Tier": s.overriddenTier ?? "",
              "Effective Tier": s.effectiveTier ?? "",
              "AI Score": s.tierScore ?? "",
              "Status": s.status,
              "Plan Type": s.planType,
              "Amount (KES)": s.amount ?? "",
            }));
            exportToCsv(rows, "tier_distribution");
          }}
        >
          <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </Button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.totalSchools}</p>
                <p className="text-xs text-muted-foreground">Total Schools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCurrency(data.totalProjectedRevenue)}</p>
                <p className="text-xs text-muted-foreground">Monthly Revenue</p>
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
                <p className="text-2xl font-bold">{data.statusCounts.trial}</p>
                <p className="text-xs text-muted-foreground">On Trial</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.tierCounts.unassigned}</p>
                <p className="text-xs text-muted-foreground">Unassigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.entries(TIER_CONFIG) as [string, typeof TIER_CONFIG.starter][]).map(([tier, config]) => {
          const Icon = config.icon;
          const count = data.tierCounts[tier as keyof typeof data.tierCounts] ?? 0;
          const revenue = data.tierRevenue[tier as keyof typeof data.tierRevenue] ?? 0;
          const pct = data.totalSchools > 0 ? Math.round((count / data.totalSchools) * 100) : 0;

          return (
            <Card
              key={tier}
              className={`hover:shadow-md transition-all cursor-pointer ${
                filterTier === tier ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setFilterTier(filterTier === tier ? null : tier)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <Badge className={config.badge}>{pct}%</Badge>
                </div>
                <h3 className="text-lg font-bold">{config.name}</h3>
                <p className="text-sm text-muted-foreground">{formatCurrency(config.price)}/month</p>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{count} schools</span>
                    <span className="font-medium">{formatCurrency(revenue)}/mo</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        tier === "starter" ? "bg-emerald-500" :
                        tier === "professional" ? "bg-blue-500" : "bg-purple-500"
                      }`}
                      style={{ width: `${(count / maxTierCount) * 100}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(data.statusCounts).map(([status, count]) => {
          const config = STATUS_CONFIG[status];
          if (!config) return null;
          return (
            <button
              key={status}
              onClick={() => setFilterStatus(filterStatus === status ? null : status)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                filterStatus === status
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <config.icon className={`h-4 w-4 ${config.color}`} />
              <span className="font-medium">{String(count)}</span>
              <span className="text-muted-foreground">{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Schools Table */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search schools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              {(filterTier || filterStatus) && (
                <button
                  onClick={() => { setFilterTier(null); setFilterStatus(null); }}
                  className="text-sm text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">School</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">AI Tier</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">Override</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">Score</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Status</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground hidden sm:table-cell">Amount</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No schools match your filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredSchools.map((school) => {
                    const tierConfig = school.tier ? TIER_CONFIG[school.tier as keyof typeof TIER_CONFIG] : null;
                    const overrideConfig = school.overriddenTier ? TIER_CONFIG[school.overriddenTier as keyof typeof TIER_CONFIG] : null;
                    const statusConfig = STATUS_CONFIG[school.status] ?? STATUS_CONFIG.no_subscription;
                    const isOverridden = !!school.overriddenTier;

                    return (
                      <tr key={school.schoolId} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isOverridden ? "bg-amber-50/30" : ""}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${tierConfig?.gradient ?? "from-gray-400 to-gray-500"} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                              {school.schoolName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{school.schoolName}</p>
                              {isOverridden && school.overrideReason && (
                                <p className="text-xs text-amber-600 truncate">{school.overrideReason}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {tierConfig ? (
                            <Badge className={tierConfig.badge}>{tierConfig.name}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          {isOverridden ? (
                            <Badge className={`${overrideConfig?.badge ?? "bg-gray-100 text-gray-700"} ring-1 ring-amber-400`}>
                              <ShieldOff className="h-3 w-3 mr-1" />
                              {overrideConfig?.name ?? school.overriddenTier}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4 hidden lg:table-cell">
                          {school.tierScore !== null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${school.tierScore}%` }} />
                              </div>
                              <span className="text-xs font-medium">{school.tierScore}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <Badge variant={school.status === "active" ? "success" : school.status === "trial" ? "warning" : "danger"}>
                            {statusConfig.label}
                          </Badge>
                        </td>
                        <td className="p-4 text-right hidden sm:table-cell">
                          {school.amount !== null ? (
                            <span className="text-sm font-medium">{formatCurrency(school.amount)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOverrideModal({
                                schoolId: school.schoolId,
                                schoolName: school.schoolName,
                                currentTier: school.tier,
                                overriddenTier: school.overriddenTier,
                              })}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            {isOverridden && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleClearOverride(school.schoolId)}
                              >
                                <Undo2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Override History */}
      {overrideHistory && overrideHistory.entries.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Override History</h3>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Overrides</p>
                  <p className="text-lg font-bold text-amber-600">{overrideHistory.totalOverrides}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Cleared</p>
                  <p className="text-lg font-bold text-green-600">{overrideHistory.totalCleared}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overrideHistory.entries.slice(0, 10).map((entry) => {
                const isClear = entry.changeType === "override_cleared";
                const newConfig = TIER_CONFIG[entry.newTier as keyof typeof TIER_CONFIG];

                return (
                  <div key={entry.id} className={`flex items-center gap-3 p-3 rounded-lg ${isClear ? "bg-green-50/50" : "bg-amber-50/50"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isClear ? "bg-green-100" : "bg-amber-100"}`}>
                      {isClear ? <Undo2 className="h-4 w-4 text-green-600" /> : <ShieldOff className="h-4 w-4 text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{entry.schoolName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={newConfig?.badge ?? "bg-gray-100 text-gray-700"} variant="outline">
                          {newConfig?.name ?? entry.newTier}
                        </Badge>
                        {entry.reason && (
                          <span className="text-xs text-muted-foreground truncate">"{entry.reason}"</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleDateString("en-KE", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Override Modal */}
      <Modal
        open={!!overrideModal}
        onClose={() => { setOverrideModal(null); setOverrideReason(""); }}
        title="Override Tier"
      >
        {overrideModal && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium text-sm">{overrideModal.schoolName}</p>
              <div className="flex items-center gap-2 mt-1">
                {overrideModal.currentTier ? (
                  <Badge className={TIER_CONFIG[overrideModal.currentTier as keyof typeof TIER_CONFIG]?.badge}>
                    AI: {TIER_CONFIG[overrideModal.currentTier as keyof typeof TIER_CONFIG]?.name}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">No AI tier assigned</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Override to Tier</Label>
              <Select value={overrideTierValue} onChange={(e) => setOverrideTierValue(e.target.value as any)}>
                <option value="starter">Starter (KES 7,000/mo)</option>
                <option value="professional">Professional (KES 22,000/mo)</option>
                <option value="enterprise">Enterprise (KES 175,000/mo)</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. School requested upgrade..."
              />
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700">
                <ShieldOff className="h-3 w-3 inline mr-1" />
                This override takes precedence over the AI recommendation.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOverrideModal(null); setOverrideReason(""); }}>
                Cancel
              </Button>
              <Button onClick={handleOverride} disabled={overrideLoading}>
                {overrideLoading && <BrandLoader variant="dots" size="sm" />}
                Apply Override
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
