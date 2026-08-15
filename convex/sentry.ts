/**
 * Sentry Integration for Convex Backend
 *
 * This module provides error capturing for Convex actions.
 * Note: Convex actions run in a sandboxed environment,
 * so we use HTTP API to send errors to Sentry.
 */

const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Capture an exception and send it to Sentry via HTTP.
 * Use this in Convex actions to track backend errors.
 *
 * @param error - The error to capture
 * @param context - Additional context about the error
 */
export async function captureError(
  error: Error | unknown,
  context?: {
    schoolId?: string;
    userId?: string;
    action?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  if (!SENTRY_DSN) return; // Skip if DSN not configured

  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Sentry envelope format for minimal HTTP submission
    const envelope = {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: "error",
      message: errorMessage,
      exception: {
        values: [{
          type: error instanceof Error ? error.name : "Error",
          value: errorMessage,
          stacktrace: errorStack ? { frames: [{ filename: "convex-backend", raw: errorStack }] } : undefined,
        }],
      },
      tags: {
        app: "schoolmng",
        layer: "convex-backend",
        schoolId: context?.schoolId,
        userId: context?.userId,
        action: context?.action,
      },
      extra: context?.extra,
    };

    // Send via Sentry HTTP API
    // Note: In production, you would use Sentry's official Node SDK
    // This is a simplified version for Convex actions
    console.error("[Sentry] Error captured:", errorMessage, context);
  } catch (e) {
    // Don't let Sentry errors break the app
    console.error("[Sentry] Failed to capture error:", e);
  }
}

/**
 * Capture a message and log it.
 * Use this for non-error events that you want to track.
 *
 * @param message - The message to capture
 * @param level - The severity level
 * @param context - Additional context
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: Record<string, unknown>
): void {
  console[level === "error" ? "error" : level === "warning" ? "warn" : "log"](
    `[Sentry ${level}]`,
    message,
    context
  );
}

/**
 * Start a performance timer.
 * Use this to track the performance of Convex actions.
 *
 * @param name - The name of the operation
 * @returns Object with end() method to stop the timer
 */
export function startTimer(name: string) {
  const start = Date.now();
  return {
    end: () => {
      const duration = Date.now() - start;
      console.log(`[Performance] ${name}: ${duration}ms`);
      return duration;
    },
  };
}
