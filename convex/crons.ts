import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Daily analytics snapshot for all schools.
 * Runs every day at midnight UTC.
 * This ensures analytics data is available without manual triggering.
 */
crons.interval("take-daily-analytics-snapshots", { hours: 24 }, internal.analytics.takeAllSnapshots);

export default crons;