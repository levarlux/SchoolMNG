/**
 * Structured logging utility for Convex backend.
 *
 * Usage:
 *   import { log } from "./lib/logger";
 *   log("error", "borrowings", "Book not found", { bookId: args.bookId });
 */
export function log(
  level: "info" | "warn" | "error",
  module: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...meta,
  };
  const method = level === "info" ? console.log : console[level];
  method(JSON.stringify(entry));
}