/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as admins from "../admins.js";
import type * as analytics from "../analytics.js";
import type * as backfill_streams from "../backfill_streams.js";
import type * as backfill_streams_helpers from "../backfill_streams_helpers.js";
import type * as books from "../books.js";
import type * as borrowings from "../borrowings.js";
import type * as classes from "../classes.js";
import type * as clerk from "../clerk.js";
import type * as crons from "../crons.js";
import type * as feature_configurations from "../feature_configurations.js";
import type * as files from "../files.js";
import type * as fines from "../fines.js";
import type * as helpers from "../helpers.js";
import type * as lib_logger from "../lib/logger.js";
import type * as reports from "../reports.js";
import type * as schools from "../schools.js";
import type * as streams from "../streams.js";
import type * as students from "../students.js";
import type * as subscriptions from "../subscriptions.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  admins: typeof admins;
  analytics: typeof analytics;
  backfill_streams: typeof backfill_streams;
  backfill_streams_helpers: typeof backfill_streams_helpers;
  books: typeof books;
  borrowings: typeof borrowings;
  classes: typeof classes;
  clerk: typeof clerk;
  crons: typeof crons;
  feature_configurations: typeof feature_configurations;
  files: typeof files;
  fines: typeof fines;
  helpers: typeof helpers;
  "lib/logger": typeof lib_logger;
  reports: typeof reports;
  schools: typeof schools;
  streams: typeof streams;
  students: typeof students;
  subscriptions: typeof subscriptions;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
