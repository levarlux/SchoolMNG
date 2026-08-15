"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Zap, Building2 } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const TIER_ICONS = {
  starter: Zap,
  professional: Star,
  enterprise: Building2,
} as const;

const TIER_COLORS = {
  starter: "text-emerald-600 bg-emerald-50 border-emerald-200",
  professional: "text-blue-600 bg-blue-50 border-blue-200",
  enterprise: "text-purple-600 bg-purple-50 border-purple-200",
} as const;

const TIER_ACCENT = {
  starter: "border-emerald-500",
  professional: "border-blue-500",
  enterprise: "border-purple-500",
} as const;

export function TierComparison({
  onCheckout,
}: {
  onCheckout: (planCode: string) => void;
}) {
  const fetchPlans = useAction(api.billing.getAllTierPlans);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof fetchPlans>> | null>(null);

  useEffect(() => {
    fetchPlans()
      .then(setPlans)
      .catch((err) => console.error("[tier-comparison] Failed to fetch plans:", err));
  }, [fetchPlans]);
  const recommended = useQuery(api.billing.getRecommendedTier);
  const [loading, setLoading] = useState<string | null>(null);

  if (!plans || plans.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const handleCheckout = async (planCode: string, tier: string) => {
    setLoading(tier);
    try {
      onCheckout(planCode);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Choose Your Plan</h2>
        <p className="text-muted-foreground">
          Select the plan that best fits your school&apos;s needs
        </p>
      </div>

      {/* Recommended tier banner */}
      {recommended?.recommendedTier && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
          <p className="text-sm font-medium text-blue-800">
            ✨ Based on your onboarding profile, we recommend the{" "}
            <span className="font-bold capitalize">
              {recommended.recommendedTier}
            </span>{" "}
            plan
            {recommended.tierScore !== null && (
              <span className="ml-1 text-blue-600">
                (Score: {recommended.tierScore}/100)
              </span>
            )}
          </p>
          {recommended.tierAnalysis && (
            <p className="mt-1 text-xs text-blue-600 line-clamp-2">
              {recommended.tierAnalysis.split("\n")[0]}
            </p>
          )}
        </div>
      )}

      {/* Tier cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const Icon = TIER_ICONS[plan.tier as keyof typeof TIER_ICONS];
          const isRecommended = recommended?.recommendedTier === plan.tier;
          const colorClass = TIER_COLORS[plan.tier as keyof typeof TIER_COLORS];
          const accentClass = TIER_ACCENT[plan.tier as keyof typeof TIER_ACCENT];

          return (
            <Card
              key={plan.tier}
              className={`relative overflow-hidden transition-all hover:shadow-lg ${
                isRecommended ? `${accentClass} border-2 shadow-md` : "border"
              }`}
            >
              {isRecommended && (
                <div className="absolute top-0 right-0">
                  <Badge className="rounded-none rounded-bl-lg bg-blue-600 text-white">
                    Recommended
                  </Badge>
                </div>
              )}

              <CardHeader className={`pb-4 ${colorClass}`}>
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <p className="text-xs opacity-75">{plan.description}</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {/* Price */}
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    KES {plan.amount.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    per month
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  className="w-full"
                  variant={isRecommended ? "default" : "outline"}
                  onClick={() => handleCheckout(plan.planCode, plan.tier)}
                  disabled={loading !== null}
                >
                  {loading === plan.tier ? <BrandLoader variant="dots" size="sm" /> : null}
                  {isRecommended ? "Get Started" : "Select Plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Analysis detail (if available) */}
      {recommended?.tierAnalysis && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Your Tier Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-muted-foreground">
              {recommended.tierAnalysis.split("\n").map((line, i) => (
                <p key={i} className={line.startsWith("**") ? "font-semibold text-foreground" : ""}>
                  {line.replace(/\*\*/g, "")}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
