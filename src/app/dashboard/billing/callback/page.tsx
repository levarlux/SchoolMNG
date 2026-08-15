"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import Link from "next/link";

type Status = "loading" | "success";

export default function BillingCallbackPage() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // The webhook handles payment verification and subscription activation
    // We just need to show a success message and redirect

    // Wait a moment for webhook to process, then show success
    const timer = setTimeout(() => {
      setStatus("success");
    }, 2000);

    return () => clearTimeout(timer);
  }, [reference]);

  // Auto-redirect to billing page after success
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        window.location.href = "/dashboard/billing";
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-6">
          {status === "loading" && (
            <>
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <BrandLoader variant="book" size="lg" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold">Processing Payment</h2>
                <p className="text-muted-foreground mt-2">
                  Please wait while we confirm your payment...
                </p>
                {reference && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Reference: <code className="bg-muted px-1.5 py-0.5 rounded">{reference}</code>
                  </p>
                )}
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-green-800">Payment Received!</h2>
                <p className="text-muted-foreground mt-2">
                  Your subscription is being activated. Redirecting to billing page...
                </p>
              </div>
              <Link href="/dashboard/billing">
                <Button className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Go to Billing
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
