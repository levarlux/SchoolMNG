/**
 * Server-side rate limiter for Convex mutations.
 *
 * Uses a simple sliding-window approach stored in the database.
 * Call `checkRateLimit(ctx, key, maxAttempts, windowMs)` at the top of any
 * mutation or action you want to protect.
 *
 * Example:
 *   await checkRateLimit(ctx, `fee-payment:${schoolId}:${userId}`, 10, 60_000);
 */
import { MutationCtx, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Check and enforce a rate limit.
 * Throws if the caller has exceeded the allowed number of attempts.
 *
 * @param ctx - Convex mutation context
 * @param key - Unique rate limit key (e.g. `fee-payment:${schoolId}:${userId}`)
 * @param maxAttempts - Maximum attempts allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  maxAttempts: number = 10,
  windowMs: number = 60_000
): Promise<void> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Find existing rate limit entry
  const existing = await ctx.db
    .query("rate_limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (existing) {
    if (existing.windowStart > windowStart) {
      // Within the current window
      if (existing.attempts >= maxAttempts) {
        const retryAfter = Math.ceil((existing.windowStart + windowMs - now) / 1000);
        throw new Error(
          `Rate limit exceeded. Try again in ${retryAfter} seconds.`
        );
      }
      // Increment attempts
      await ctx.db.patch(existing._id, {
        attempts: existing.attempts + 1,
        lastAttempt: now,
      });
    } else {
      // Window has expired, reset
      await ctx.db.patch(existing._id, {
        attempts: 1,
        windowStart: now,
        lastAttempt: now,
      });
    }
  } else {
    // First attempt — create entry
    await ctx.db.insert("rate_limits", {
      key,
      attempts: 1,
      windowStart: now,
      lastAttempt: now,
    });
  }
}

/**
 * Internal wrapper so ACTIONS can enforce the same rate limit (actions only
 * have runMutation, not a MutationCtx). Call via
 * `ctx.runMutation(internal.rateLimit.enforce, { key, maxAttempts, windowMs })`.
 */
export const enforce = internalMutation({
  args: {
    key: v.string(),
    maxAttempts: v.optional(v.number()),
    windowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx, args.key, args.maxAttempts ?? 10, args.windowMs ?? 60_000);
  },
});

/**
 * Cleanup old rate limit entries. Call this periodically via a cron job.
 */
export async function cleanupExpiredLimits(ctx: MutationCtx, maxAgeMs: number = 3_600_000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const expired = await ctx.db
    .query("rate_limits")
    .filter((q) => q.lt(q.field("lastAttempt"), cutoff))
    .take(1000);

  let deleted = 0;
  for (const entry of expired) {
    await ctx.db.delete(entry._id);
    deleted++;
  }
  return deleted;
}
