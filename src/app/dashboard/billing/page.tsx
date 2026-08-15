"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { TierComparison } from "@/components/tier-comparison";
import { CreditCard, CheckCircle2, AlertTriangle, Shield, ArrowRight, Crown, Sparkles, XCircle, Receipt, CalendarClock, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { openInBrowser } from "@/lib/open-in-browser"

// ── Helpers ──────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTrialProgress(startedAt: number, endsAt: number) {
  const now = Date.now();
  const total = endsAt - startedAt;
  const elapsed = now - startedAt;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

type BillingEntry = {
  event: string;
  reference: string;
  amount: number | null;
  status: "paid" | "pending";
  date: number;
};

// ── Main Page ────────────────────────────────────────────────────

export default function BillingPage() {
  const school = useSchool();
  const subscription = useQuery(api.billing.getMySubscription);
  const billingHistory = useQuery(api.billing.getBillingHistory);
  const planInfo = useQuery(api.billing.getSubscriptionPlan);
  const fetchAllPlans = useAction(api.billing.getAllTierPlans);
  const [allPlans, setAllPlans] = useState<Awaited<ReturnType<typeof fetchAllPlans>> | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);

  // Fetch live prices from Paystack on mount
  useEffect(() => {
    setPlansLoading(true);
    fetchAllPlans()
      .then((plans) => {
        setAllPlans(plans);
        setPlansLoading(false);
      })
      .catch((err) => {
        console.error("[billing] Failed to fetch live plan prices:", err);
        setPlansLoading(false);
      });
  }, [fetchAllPlans]);
  const recommended = useQuery(api.billing.getRecommendedTier);
  const fetchPlanDetails = useAction(api.billing.fetchPlanDetails);
  const [plan, setPlan] = useState<typeof planInfo>(undefined);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const ensureTrial = useMutation(api.billing.ensureTrialSubscription);
  const cancelSubscription = useAction(api.billing.cancelSubscription);
  const initializeCheckout = useAction(api.paystack.initializeCheckout);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Is this a development environment?
  const isDev = typeof window !== "undefined" && window.location.hostname === "localhost";

  // Tick the clock every minute for live countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Resolve the active plan details from allPlans based on actual subscription data
  const activePlan = useMemo(() => {
    if (!allPlans || allPlans.length === 0) return null;
    
    // 1. Try matching by actual subscription planCode or amount
    if (subscription?.planCode) {
      const match = allPlans.find((p) => p.planCode === subscription.planCode);
      if (match) return match;
    }
    if (subscription?.amount) {
      const match = allPlans.find((p) => p.amount === subscription.amount);
      if (match) return match;
    }

    // 2. Fall back to recommended / assigned tier
    if (recommended?.recommendedTier) {
      const match = allPlans.find((p) => p.tier === recommended.recommendedTier);
      if (match) return match;
    }

    return allPlans[0];
  }, [allPlans, subscription, recommended]);

  // Auto-create trial if no subscription exists
  useEffect(() => {
    if (subscription === null && school) {
      ensureTrial().catch(console.error);
    }
  }, [subscription, school, ensureTrial]);

  const trialDaysLeft = useMemo(() => {
    if (!subscription?.trialDaysRemaining) return 0;
    return subscription.trialDaysRemaining;
  }, [subscription?.trialDaysRemaining]);

  const trialProgress = useMemo(() => {
    if (!subscription || !subscription.status || subscription.status !== "trial") return 0;
    // Server calculates trial progress based on stored timestamps
    return Math.max(0, Math.min(100, 100 - (trialDaysLeft / 7) * 100));
  }, [subscription, trialDaysLeft]);

  const isTrialExpired = subscription?.status === "trial" && trialDaysLeft <= 0;
  const isPaid = subscription?.status === "active" || subscription?.isCancelledButActive;
  const isCancelled = subscription?.status === "cancelled";
  const isCancelledButActive = isCancelled && subscription?.nextBillingDate && subscription.nextBillingDate > now;
  const isPastDue = subscription?.status === "past_due";

  // ── Current billing period ───────────────────────────────
  const periodStart = subscription?.lastPaymentAt ?? subscription?.trialStartedAt ?? null;
  const periodEnd = subscription?.nextBillingDate ?? null;
  const periodProgress = useMemo(() => {
    if (!periodStart || !periodEnd || periodEnd <= periodStart) return 0;
    return Math.min(100, Math.max(0, ((now - periodStart) / (periodEnd - periodStart)) * 100));
  }, [periodStart, periodEnd, now]);

  const daysUntilRenewal = useMemo(() => {
    if (!periodEnd) return null;
    return Math.max(0, Math.ceil((periodEnd - now) / (24 * 60 * 60 * 1000)));
  }, [periodEnd, now]);

  // ── Handle Paystack checkout ──────────────────────────────

  async function handleSubscribe(planCode?: string) {
    setCheckoutLoading(true);
    try {
      // Use the tier-specific plan code, or fall back to the active plan / recommended tier's plan code
      const selectedPlanCode = planCode
        || activePlan?.planCode
        || recommended?.assignedPlanCode
        || undefined;

      const result = await initializeCheckout({
        metadata: {
          schoolId: school?._id,
          schoolName: school?.name,
          planType: "monthly",
        },
        callbackUrl: `${window.location.origin}/dashboard/billing`,
        planCode: selectedPlanCode,
      });

      if (result?.authorization_url) {
        await openInBrowser(result.authorization_url);
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[billing] Checkout error:", err);
      toast.error(`Failed to start checkout: ${msg}`);
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ── Handle cancel subscription ────────────────────────────

  async function handleCancelSubscription() {
    setCancelLoading(true);
    try {
      await cancelSubscription();
      toast.success("Subscription cancelled successfully");
      setShowCancelModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[billing] Cancel error:", err);
      toast.error(`Failed to cancel: ${msg}`);
    } finally {
      setCancelLoading(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────

  if (subscription === undefined || plansLoading || !activePlan) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-1">
          Manage your {school?.name ?? "school"}&apos;s subscription plan.
        </p>
      </div>

      {/* ── Status Banner ─────────────────────────────────── */}
      {isTrialExpired && (
        <div className="flex items-start gap-3 p-5 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
          <AlertTriangle className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-red-800">Your free trial has ended</p>
            <p className="text-sm text-red-700">
              Subscribe now to continue using all features. Your school data is safe and waiting for you.
            </p>
          </div>
        </div>
      )}

      {isPastDue && (
        <div className="flex items-start gap-3 p-5 rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50">
          <AlertTriangle className="h-6 w-6 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-yellow-800">Payment overdue</p>
            <p className="text-sm text-yellow-700">
              Your last payment didn&apos;t go through. Please update your payment method to avoid service interruption.
            </p>
          </div>
        </div>
      )}

      {isCancelledButActive && (
        <div className="flex items-start gap-3 p-5 rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50">
          <AlertTriangle className="h-6 w-6 text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-yellow-800">Subscription cancelled — active until {periodEnd ? new Date(periodEnd).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "end of period"}</p>
            <p className="text-sm text-yellow-700">
              Your subscription has been cancelled. You will continue to have full access until {periodEnd ? new Date(periodEnd).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" }) : "the end of the billing period"}. You can resubscribe at any time.
            </p>
          </div>
        </div>
      )}

      {isCancelled && !isCancelledButActive && (
        <div className="flex items-start gap-3 p-5 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
          <XCircle className="h-6 w-6 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-gray-800">Subscription expired</p>
            <p className="text-sm text-gray-700">
              Your subscription has expired. Resubscribe to regain access.
            </p>
          </div>
        </div>
      )}

      {/* ── 2-column layout on large screens ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* ── Tier Comparison (when no active subscription) ──── */}
      {!isPaid && !isTrialExpired && !isPastDue && (
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <TierComparison onCheckout={(planCode) => handleSubscribe(planCode)} />
          </CardContent>
        </Card>
      )}

      {/* ── Recommended Tier Summary ──────────────────────── */}
      {recommended?.recommendedTier && isPaid && (
        <Card className="lg:col-span-2 border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  AI-Recommended Plan: <span className="capitalize font-bold">{recommended.recommendedTier}</span>
                </p>
                {recommended.tierScore !== null && (
                  <p className="text-xs text-blue-600">
                    Score: {recommended.tierScore}/100 • Assigned {recommended.tierAssignedAt ? new Date(recommended.tierAssignedAt).toLocaleDateString() : "during onboarding"}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Change Plan Button ────────────────────────────── */}
      {isPaid && (
        <div className="lg:col-span-2 flex justify-end">
          <Button
            variant="outline"
            onClick={() => setShowPlanPicker(!showPlanPicker)}
          >
            {showPlanPicker ? "Hide Plans" : "View All Plans"}
          </Button>
        </div>
      )}

      {/* ── Expanded Plan Picker ──────────────────────────── */}
      {isPaid && showPlanPicker && (
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <TierComparison onCheckout={(planCode) => handleSubscribe(planCode)} />
          </CardContent>
        </Card>
      )}

      {/* ── Current Plan Card ─────────────────────────────── */}
      <Card className="lg:col-span-2 overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Crown className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {activePlan.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(activePlan.amount)}/{activePlan.interval}
                  {recommended?.tierScore !== null && recommended?.tierScore !== undefined && (
                    <span className="ml-2 text-blue-600">(AI Score: {recommended.tierScore}/100)</span>
                  )}
                </p>
              </div>
            </div>
            <Badge
              variant={
                isPaid ? "success" : isTrialExpired ? "danger" : (subscription && subscription.isTrialActive) ? "warning" : "secondary"
              }
              className="text-sm px-3 py-1"
            >
              {isPaid && <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Active</>}
              {subscription && subscription.isTrialActive && <><Sparkles className="h-3.5 w-3.5 mr-1" /> Free Trial</>}
              {isTrialExpired && <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Expired</>}
              {isCancelled && "Cancelled"}
              {isPastDue && <><AlertTriangle className="h-3.5 w-3.5 mr-1" /> Past Due</>}
            </Badge>
          </div>
        </div>

        <CardContent className="p-6">
          {/* Trial countdown */}
          {subscription && subscription.isTrialActive && (
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trial period</span>
                <span className="font-semibold">
                  {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
                </span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                  style={{ width: `${trialProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Active subscription details */}
          {isPaid && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <p className="font-semibold text-green-600">Active</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Next billing</p>
                <p className="font-semibold">
                  {subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "—"}
                </p>
              </div>
              {subscription.lastPaymentAt && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Last payment</p>
                  <p className="font-semibold">{formatDate(subscription.lastPaymentAt)}</p>
                </div>
              )}
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Billing</p>
                <p className="font-semibold">{formatCurrency(activePlan.amount)}/month</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Current period</p>
                <p className="font-semibold text-sm">
                  {subscription.lastPaymentAt
                    ? `${formatDate(subscription.lastPaymentAt)} → ${subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "—"}`
                    : "—"}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Renews in</p>
                <p className="font-semibold">
                  {daysUntilRenewal !== null
                    ? `${daysUntilRenewal} day${daysUntilRenewal !== 1 ? "s" : ""}`
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {/* Current billing period progress */}
          {(isPaid && periodStart && periodEnd) && (() => {
            const daysLeft = daysUntilRenewal ?? 0;
            const barColor = isCancelledButActive
              ? (daysLeft > 7 ? "from-green-500 to-green-400" : daysLeft > 3 ? "from-yellow-500 to-yellow-400" : "from-red-500 to-red-400")
              : "from-primary to-primary/70";
            const textColor = isCancelledButActive
              ? (daysLeft > 7 ? "text-green-700" : daysLeft > 3 ? "text-yellow-700" : "text-red-700")
              : "";
            return (
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" /> Billing cycle
                  </span>
                  <span className={`font-semibold ${textColor}`}>
                    {isCancelledButActive && daysLeft > 0
                      ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
                      : `${Math.round(periodProgress)}% elapsed`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${periodProgress}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!isPaid && (
              <Button
                size="lg"
                onClick={() => handleSubscribe()}
                disabled={checkoutLoading}
                className="flex-1 text-base py-6 gap-3"
              >
                {checkoutLoading ? (
                  <BrandLoader variant="book" size="md" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
                {isTrialExpired ? "Subscribe Now" : isCancelled ? "Resubscribe" : isPastDue ? "Update Payment" : "Subscribe Now"}
                {!checkoutLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            )}

            {/* Cancel button - only show for active (not yet cancelled) subscriptions */}
            {isPaid && subscription?.status === "active" && (
              <Button
                variant="outline"
                onClick={() => setShowCancelModal(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Cancel Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Features Grid ─────────────────────────────────── */}
      <div>
        <h3 className="text-lg font-semibold mb-4">What&apos;s included</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activePlan.features.map((feature, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Billing History ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Billing History
          </CardTitle>
          <CardDescription>
            Recent payments and invoices for your subscription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingHistory === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BrandLoader variant="dots" size="sm" /> Loading history...
            </div>
          ) : billingHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded yet. Your first payment will appear here once made.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Reference</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-4 py-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billingHistory.map((entry: BillingEntry) => (
                    <tr key={entry.reference + entry.date} className="border-t border-border">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(entry.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                        {entry.reference}
                      </td>
                      <td className="px-4 py-3 capitalize">{entry.event === "charge.success" ? "Payment" : "Invoice"}</td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                        {entry.amount !== null ? formatCurrency(entry.amount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
                            <AlertTriangle className="h-3 w-3" /> Pending
                          </span>
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

      {/* ── Payment Methods ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" /> Secure Payments
          </CardTitle>
          <CardDescription>
            Payments are processed securely via Paystack. We accept cards and mobile money.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-8 w-12 rounded bg-muted flex items-center justify-center text-xs font-bold">
                VISA
              </div>
              <span>Visa</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-12 rounded bg-muted flex items-center justify-center text-xs font-bold">
                MC
              </div>
              <span>Mastercard</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-12 rounded bg-muted flex items-center justify-center text-xs font-bold">
                Verve
              </div>
              <span>Verve</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            🔒 Subscriptions use card payments for automatic recurring billing. Your card details are encrypted and never stored.
          </p>
        </CardContent>
      </Card>

      {/* ── FAQ ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              q: "Can I cancel anytime?",
              a: "Yes, you can cancel your subscription at any time. Your access will continue until the end of the current billing period.",
            },
            {
              q: "What happens to my data if I don't pay?",
              a: "Your school data is safe. If your subscription expires, you'll have read-only access for 30 days, then data is archived for 90 days before deletion.",
            },
            {
              q: "Can I change my plan later?",
              a: "Yes, contact our support team to upgrade or downgrade your plan. Changes take effect at the next billing cycle.",
            },
          ].map((faq, i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/30">
              <p className="font-medium text-sm">{faq.q}</p>
              <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      </div>
      {/* ── end grid ───────────────────────────────────────── */}

      {/* ── Testing Controls (DEV ONLY) ───────────────────── */}
      {isDev && (
        <Card className="border-dashed border-yellow-300 bg-yellow-50/50">
          <CardContent className="p-4">
            <p className="text-xs text-yellow-700 mb-3 font-medium">🧪 Testing Controls (Not shown in production)</p>
            <p className="text-xs text-yellow-600">
              Use the Cancel Subscription button above to test cancellation flow.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Cancel Confirmation Modal ─────────────────────── */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Subscription"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              disabled={cancelLoading}
            >
              Keep Subscription
            </Button>              <Button
                variant="danger"
              onClick={handleCancelSubscription}
              disabled={cancelLoading}
            >
              {cancelLoading ? (
                <BrandLoader variant="dots" size="sm" className="mr-2" />
              ) : null}
              Cancel Subscription
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
