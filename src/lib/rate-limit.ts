const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple client-side rate limiter for form submissions.
 * Returns true if the action is allowed, false if rate-limited.
 *
 * Usage:
 *   if (!checkRateLimit("borrow-create", 5, 60_000)) {
 *     toast.error("Too many attempts. Please wait a moment.");
 *     return;
 *   }
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60_000
): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxAttempts) {
    return false;
  }

  entry.count++;
  return true;
}
