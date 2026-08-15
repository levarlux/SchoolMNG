"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard, Lock, AlertTriangle, Crown,
  Shield, CheckCircle2, Sparkles,
} from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { openInBrowser } from "@/lib/open-in-browser";
import { TierComparison } from "@/components/tier-comparison";
import { toast } from "sonner";

function formatCurrency(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

export default function Paywall() {
  const router = useRouter();
  const access = useQuery(api.billing.hasAccess);
  const subscription = useQuery(api.billing.getMySubscription);
  const recommended = useQuery(api.billing.getRecommendedTier);
  const fetchAllPlans = useAction(api.billing.getAllTierPlans);
  const [allPlans, setAllPlans] = useState<Awaited<ReturnType<typeof fetchAllPlans>> | null>(null);

  useEffect(() => {
    fetchAllPlans()
      .then(setAllPlans)
      .catch((err) => console.error("[paywall] Failed to fetch live plan prices:", err));
  }, [fetchAllPlans]);
  const ensureTrial = useMutation(api.billing.ensureTrialSubscription);
  const initializeCheckout = useAction(api.paystack.initializeCheckout);
  const extendTrialDev = useMutation(api.billing.extendTrialForDevelopment);
  const school = useSchool();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  /**
   * Pick the plan to display & subscribe to:
   * 1. The plan from `allPlans` that matches the AI-recommended tier.
   * 2. Fall back to the first plan in the list (Starter).
   * This ensures the displayed price and the Paystack plan code always agree.
   */
  const plan = useMemo(() => {
    if (!allPlans || allPlans.length === 0) return undefined;
    if (recommended?.recommendedTier) {
      const match = allPlans.find((p) => p.tier === recommended.recommendedTier);
      if (match) return match;
    }
    return allPlans[0];
  }, [allPlans, recommended?.recommendedTier]);

  // Tick clock every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // No school behind this account — onboarding must run first, not a paywall.
  // hasAccess returns reason "not_authenticated" only when the school lookup
  // definitively failed (no school/org), so this cannot fire spuriously while
  // the independent school query is still resolving.
  useEffect(() => {
    if (access && !access.hasAccess && access.reason === "not_authenticated") {
      router.replace("/onboarding");
    }
  }, [access, router]);

  // Auto-create trial if no subscription exists (only when a school exists —
  // a deleted account must NOT re-trigger trial creation)
  useEffect(() => {
    if (subscription === null && school && access && !access.hasAccess) {
      ensureTrial().catch(console.error);
    }
  }, [subscription, access, ensureTrial, school]);

  const trialDaysLeft = subscription?.trialDaysRemaining ?? 0;

  const isTrialExpired = subscription?.status === "trial" && trialDaysLeft <= 0;

  async function handleSubscribe(planCode?: string) {
    setCheckoutLoading(true);
    try {
      // Use the explicitly passed plan code, or the plan derived from the
      // recommended tier displayed in the UI — never the raw assignedPlanCode
      // which may differ from what is shown.
      const selectedPlanCode = planCode ?? plan?.planCode ?? undefined;

      const result = await initializeCheckout({
        metadata: {
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
      console.error("[paywall] Checkout error:", err);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleSkipPayment() {
    setSkipLoading(true);
    try {
      await extendTrialDev();
      toast.success("Payment skipped — trial extended for development");
    } catch (err: unknown) {
      console.error("[paywall] Skip payment error:", err);
      toast.error("Failed to skip payment");
    } finally {
      setSkipLoading(false);
    }
  }

  // Loading state — wait for access check and plan list
  if (access === undefined || allPlans === undefined || plan === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  // Has access - render children (passed as prop)
  if (access.hasAccess) {
    return null; // Will be handled by parent component
  }

  // No school behind this account — onboarding must run first, not a paywall.
  if (!school) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-4">
        <BrandLoader variant="book" size="md" />
        <p className="text-sm text-muted-foreground">Setting up your school…</p>
      </div>
    );
  }

  // No access - show full-screen paywall page
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto min-h-screen flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl space-y-6 my-auto">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Subscription Required</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Your free trial has ended. Select a plan below to continue using SchoolMNG.
          </p>
        </div>

        {/* Status Banner */}
        {isTrialExpired && (
          <div className="max-w-xl mx-auto flex items-center gap-3 p-3.5 rounded-xl border border-yellow-200 bg-yellow-50/80">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-800 font-medium">
              You had {trialDaysLeft} days of free trial. Subscribe now to regain access.
            </p>
          </div>
        )}

        {/* Tier Comparison */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <TierComparison onCheckout={(planCode) => handleSubscribe(planCode)} />
        </div>

        {/* Footer controls & security note */}
        <div className="flex flex-col items-center justify-center gap-3 text-xs text-muted-foreground pt-2 pb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            <span>Secure card payment via Paystack</span>
          </div>

          {/* Dev-only: skip payment */}
          {typeof window !== "undefined" && window.location.hostname === "localhost" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkipPayment}
              disabled={skipLoading}
              className="gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {skipLoading ? (
                <BrandLoader variant="dots" size="sm" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Skip payment (dev only)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PaywallWrapper({ children }: { children: React.ReactNode }) {
  const access = useQuery(api.billing.hasAccess);

  // Loading state
  if (access === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <BrandLoader variant="full" size="md" />
      </div>
    );
  }

  // No access - show paywall overlay
  if (!access.hasAccess) {
    return <Paywall />;
  }

  // Has access - render children
  return <>{children}</>;
}
