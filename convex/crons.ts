import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily analytics snapshot for all schools.
 * Runs every day at midnight UTC.
 * This ensures analytics data is available without manual triggering.
 */
crons.interval("take-daily-analytics-snapshots", { hours: 24 }, internal.analytics.takeAllSnapshots);

/**
 * Expire cancelled subscriptions whose billing period has ended.
 * Runs every 6 hours — cancelled subs with nextBillingDate in the past
 * are flipped from "cancelled" to "expired" so the data stays clean.
 */
crons.interval("expire-cancelled-subscriptions", { hours: 6 }, internal.subscriptions.expireCancelledSubscriptions);

/**
 * Refresh dashboard cache for all schools every hour.
 * This ensures page loads serve from cache (1 read) instead of
 * recomputing (100+ reads). The cron reads ~200 docs per school,
 * which is much cheaper than 10 page loads × 200 reads each.
 */
crons.interval("refresh-dashboard-cache", { hours: 1 }, internal.refreshDashboardCache.refreshAllDashboardCaches);

/**
 * Re-evaluate all schools' tier assignments monthly.
 * Adjusts Paystack plan recommendations as schools grow/shrink.
 * Runs on the 1st of each month at 02:00 UTC.
 */
crons.cron("re-evaluate-tiers", "0 2 1 * *", internal.tierAssignment.reEvaluateAllTiers);

export default crons;