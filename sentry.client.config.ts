import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for finer control
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Sampling rate for session replay
  replaysSessionSampleRate: 0.1,

  // If the entire session is not an error, sample it
  replaysOnErrorSampleRate: 1.0,

  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.NODE_ENV === "development",

  environment: process.env.NODE_ENV,

  // Don't send personally identifiable information (PII)
  sendDefaultPii: false,

  // Ignore common non-error issues
  ignoreErrors: [
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "NetworkError",
    "AbortError",
  ],
});
