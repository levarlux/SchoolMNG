"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Custom error fallback component for Sentry Error Boundary.
 * Shows a user-friendly error page with retry option.
 */
export function SentryErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  useEffect(() => {
    // Log the error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>

        <div>
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Our team has been notified and
            is working on a fix.
          </p>
        </div>

        <div className="p-4 rounded-lg bg-muted text-left">
          <p className="text-sm font-mono text-muted-foreground">
            {error.message || "Unknown error occurred"}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={resetError} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button onClick={() => (window.location.href = "/")}>
            Go to Homepage
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Error ID: {Sentry.lastEventId() || "N/A"}
        </p>
      </div>
    </div>
  );
}

/**
 * Wrap your app with this component to catch and report errors to Sentry.
 *
 * Usage:
 * import { SentryErrorBoundary } from "@/components/sentry-error-boundary";
 *
 * <SentryErrorBoundary>
 *   <YourApp />
 * </SentryErrorBoundary>
 */
export function SentryErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Sentry.ErrorBoundary fallback={<SentryErrorFallback error={new Error("Unknown")} resetError={() => {}} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
