/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as academicYears from "../academicYears.js";
import type * as admin from "../admin.js";
import type * as admins from "../admins.js";
import type * as admissions from "../admissions.js";
import type * as aiAssistant from "../aiAssistant.js";
import type * as aiSessions from "../aiSessions.js";
import type * as analytics from "../analytics.js";
import type * as announcements from "../announcements.js";
import type * as appointments from "../appointments.js";
import type * as assistantAgent from "../assistantAgent.js";
import type * as attendance from "../attendance.js";
import type * as auditLog from "../auditLog.js";
import type * as backfill_eav from "../backfill_eav.js";
import type * as backfill_streams from "../backfill_streams.js";
import type * as backfill_streams_helpers from "../backfill_streams_helpers.js";
import type * as billing from "../billing.js";
import type * as blueprints from "../blueprints.js";
import type * as boardMeetings from "../boardMeetings.js";
import type * as bookHolds from "../bookHolds.js";
import type * as books from "../books.js";
import type * as borrowings from "../borrowings.js";
import type * as bulkOperations from "../bulkOperations.js";
import type * as calcEngine from "../calcEngine.js";
import type * as calculations from "../calculations.js";
import type * as chartConfigs from "../chartConfigs.js";
import type * as classAssignments from "../classAssignments.js";
import type * as classResolver from "../classResolver.js";
import type * as classes from "../classes.js";
import type * as clerk from "../clerk.js";
import type * as clerkWebhook from "../clerkWebhook.js";
import type * as compliance from "../compliance.js";
import type * as comprehensiveReports from "../comprehensiveReports.js";
import type * as correspondence from "../correspondence.js";
import type * as crons from "../crons.js";
import type * as dashboardCache from "../dashboardCache.js";
import type * as dashboardStats from "../dashboardStats.js";
import type * as discipline from "../discipline.js";
import type * as dutyRoster from "../dutyRoster.js";
import type * as entityLinks from "../entityLinks.js";
import type * as events from "../events.js";
import type * as exams from "../exams.js";
import type * as expenditures from "../expenditures.js";
import type * as exportData from "../exportData.js";
import type * as exports from "../exports.js";
import type * as extracurricular from "../extracurricular.js";
import type * as feature_configurations from "../feature_configurations.js";
import type * as fees from "../fees.js";
import type * as fieldValues from "../fieldValues.js";
import type * as fields from "../fields.js";
import type * as files from "../files.js";
import type * as fines from "../fines.js";
import type * as gateLog from "../gateLog.js";
import type * as globalSearch from "../globalSearch.js";
import type * as guardianLinks from "../guardianLinks.js";
import type * as guardians from "../guardians.js";
import type * as health from "../health.js";
import type * as helpers from "../helpers.js";
import type * as hr from "../hr.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as importCatalog from "../importCatalog.js";
import type * as importCleanup from "../importCleanup.js";
import type * as importMappings from "../importMappings.js";
import type * as imports from "../imports.js";
import type * as inventory from "../inventory.js";
import type * as invitations from "../invitations.js";
import type * as lessonPlans from "../lessonPlans.js";
import type * as lib_logger from "../lib/logger.js";
import type * as maintenance from "../maintenance.js";
import type * as marksImport from "../marksImport.js";
import type * as medical from "../medical.js";
import type * as members from "../members.js";
import type * as modules from "../modules.js";
import type * as nav from "../nav.js";
import type * as notificationRules from "../notificationRules.js";
import type * as notifications from "../notifications.js";
import type * as ocr from "../ocr.js";
import type * as onboarding from "../onboarding.js";
import type * as parentMeetings from "../parentMeetings.js";
import type * as payroll from "../payroll.js";
import type * as paystack from "../paystack.js";
import type * as pdfGenerator from "../pdfGenerator.js";
import type * as permissionAgent from "../permissionAgent.js";
import type * as permissions from "../permissions.js";
import type * as platformAudit from "../platformAudit.js";
import type * as promotions from "../promotions.js";
import type * as rateLimit from "../rateLimit.js";
import type * as records from "../records.js";
import type * as refreshDashboardCache from "../refreshDashboardCache.js";
import type * as reports from "../reports.js";
import type * as roles from "../roles.js";
import type * as schoolAnalytics from "../schoolAnalytics.js";
import type * as schools from "../schools.js";
import type * as scopeRules from "../scopeRules.js";
import type * as sections from "../sections.js";
import type * as seedEAV from "../seedEAV.js";
import type * as seedFullTree from "../seedFullTree.js";
import type * as sentry from "../sentry.js";
import type * as staffAssignments from "../staffAssignments.js";
import type * as staffAttendance from "../staffAttendance.js";
import type * as streams from "../streams.js";
import type * as studentAttendance from "../studentAttendance.js";
import type * as studentBoarding from "../studentBoarding.js";
import type * as studentCounseling from "../studentCounseling.js";
import type * as studentDocuments from "../studentDocuments.js";
import type * as studentEavLookup from "../studentEavLookup.js";
import type * as studentFeeding from "../studentFeeding.js";
import type * as studentFinance from "../studentFinance.js";
import type * as studentMedical from "../studentMedical.js";
import type * as studentProfiles from "../studentProfiles.js";
import type * as studentReports from "../studentReports.js";
import type * as studentScreenings from "../studentScreenings.js";
import type * as studentTransport from "../studentTransport.js";
import type * as students from "../students.js";
import type * as subjects from "../subjects.js";
import type * as subscriptions from "../subscriptions.js";
import type * as teachers from "../teachers.js";
import type * as terms from "../terms.js";
import type * as tierAssignment from "../tierAssignment.js";
import type * as timetable from "../timetable.js";
import type * as tour from "../tour.js";
import type * as transport from "../transport.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  academicYears: typeof academicYears;
  admin: typeof admin;
  admins: typeof admins;
  admissions: typeof admissions;
  aiAssistant: typeof aiAssistant;
  aiSessions: typeof aiSessions;
  analytics: typeof analytics;
  announcements: typeof announcements;
  appointments: typeof appointments;
  assistantAgent: typeof assistantAgent;
  attendance: typeof attendance;
  auditLog: typeof auditLog;
  backfill_eav: typeof backfill_eav;
  backfill_streams: typeof backfill_streams;
  backfill_streams_helpers: typeof backfill_streams_helpers;
  billing: typeof billing;
  blueprints: typeof blueprints;
  boardMeetings: typeof boardMeetings;
  bookHolds: typeof bookHolds;
  books: typeof books;
  borrowings: typeof borrowings;
  bulkOperations: typeof bulkOperations;
  calcEngine: typeof calcEngine;
  calculations: typeof calculations;
  chartConfigs: typeof chartConfigs;
  classAssignments: typeof classAssignments;
  classResolver: typeof classResolver;
  classes: typeof classes;
  clerk: typeof clerk;
  clerkWebhook: typeof clerkWebhook;
  compliance: typeof compliance;
  comprehensiveReports: typeof comprehensiveReports;
  correspondence: typeof correspondence;
  crons: typeof crons;
  dashboardCache: typeof dashboardCache;
  dashboardStats: typeof dashboardStats;
  discipline: typeof discipline;
  dutyRoster: typeof dutyRoster;
  entityLinks: typeof entityLinks;
  events: typeof events;
  exams: typeof exams;
  expenditures: typeof expenditures;
  exportData: typeof exportData;
  exports: typeof exports;
  extracurricular: typeof extracurricular;
  feature_configurations: typeof feature_configurations;
  fees: typeof fees;
  fieldValues: typeof fieldValues;
  fields: typeof fields;
  files: typeof files;
  fines: typeof fines;
  gateLog: typeof gateLog;
  globalSearch: typeof globalSearch;
  guardianLinks: typeof guardianLinks;
  guardians: typeof guardians;
  health: typeof health;
  helpers: typeof helpers;
  hr: typeof hr;
  http: typeof http;
  identity: typeof identity;
  importCatalog: typeof importCatalog;
  importCleanup: typeof importCleanup;
  importMappings: typeof importMappings;
  imports: typeof imports;
  inventory: typeof inventory;
  invitations: typeof invitations;
  lessonPlans: typeof lessonPlans;
  "lib/logger": typeof lib_logger;
  maintenance: typeof maintenance;
  marksImport: typeof marksImport;
  medical: typeof medical;
  members: typeof members;
  modules: typeof modules;
  nav: typeof nav;
  notificationRules: typeof notificationRules;
  notifications: typeof notifications;
  ocr: typeof ocr;
  onboarding: typeof onboarding;
  parentMeetings: typeof parentMeetings;
  payroll: typeof payroll;
  paystack: typeof paystack;
  pdfGenerator: typeof pdfGenerator;
  permissionAgent: typeof permissionAgent;
  permissions: typeof permissions;
  platformAudit: typeof platformAudit;
  promotions: typeof promotions;
  rateLimit: typeof rateLimit;
  records: typeof records;
  refreshDashboardCache: typeof refreshDashboardCache;
  reports: typeof reports;
  roles: typeof roles;
  schoolAnalytics: typeof schoolAnalytics;
  schools: typeof schools;
  scopeRules: typeof scopeRules;
  sections: typeof sections;
  seedEAV: typeof seedEAV;
  seedFullTree: typeof seedFullTree;
  sentry: typeof sentry;
  staffAssignments: typeof staffAssignments;
  staffAttendance: typeof staffAttendance;
  streams: typeof streams;
  studentAttendance: typeof studentAttendance;
  studentBoarding: typeof studentBoarding;
  studentCounseling: typeof studentCounseling;
  studentDocuments: typeof studentDocuments;
  studentEavLookup: typeof studentEavLookup;
  studentFeeding: typeof studentFeeding;
  studentFinance: typeof studentFinance;
  studentMedical: typeof studentMedical;
  studentProfiles: typeof studentProfiles;
  studentReports: typeof studentReports;
  studentScreenings: typeof studentScreenings;
  studentTransport: typeof studentTransport;
  students: typeof students;
  subjects: typeof subjects;
  subscriptions: typeof subscriptions;
  teachers: typeof teachers;
  terms: typeof terms;
  tierAssignment: typeof tierAssignment;
  timetable: typeof timetable;
  tour: typeof tour;
  transport: typeof transport;
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
