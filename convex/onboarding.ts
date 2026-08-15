/**
 * Onboarding Session Module
 *
 * Manages the 13-step guided setup wizard for new schools.
 * Implements session isolation — each session is scoped to one school,
 * and the AI agent only sees that session's history + current step schema.
 */
import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePrincipal, logAuditEntry, requireAuth, getOrgIdFromJwt } from "./helpers";
import { api } from "./_generated/api";
import { LEADERSHIP_ROLE_KEY } from "./roles";

// ── Step Definitions ────────────────────────────────────────────────

export const STEPS = [
  { number: 1, name: "School Basics", description: "Name, type, terms, logo" },
  { number: 2, name: "School Context", description: "Fees, facilities, headcount, record-keeping" },
  { number: 3, name: "Setup Route", description: "Guided setup vs upload existing documents" },
  { number: 4, name: "Learners Setup", description: "Modules & fields for students" },
  { number: 5, name: "Teaching Staff", description: "Modules for teachers" },
  { number: 6, name: "Non-Teaching Staff", description: "Roles & workspaces" },
  { number: 7, name: "Administrative Staff", description: "Finance, HR, admissions" },
  { number: 8, name: "Guardians", description: "Parent portal settings" },
  { number: 9, name: "Notifications", description: "Alert triggers & channels" },
  { number: 10, name: "Review", description: "Review configuration before going live" },
  { number: 11, name: "Staff Accounts", description: "Create initial logins" },
  { number: 12, name: "Import Students", description: "Bulk import (optional)" },
  { number: 13, name: "Done", description: "Dashboard handoff" },
] as const;

// ── Provisioning ─────────────────────────────────────────────────────

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Idempotently provision the caller's school: creates the school row
 * (keyed to the JWT org_id), a 7-day trial subscription and a principal
 * membership for the caller.
 *
 * This is the fallback for when the `organization.created` Clerk webhook
 * never reached Convex — it guarantees a fresh signup always lands on
 * onboarding instead of a paywall with no school behind it.
 */
export const provisionSchool = mutation({
  args: {
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    leadershipTitle: v.optional(v.string()),
  },
  handler: async (ctx, { name, slug, leadershipTitle }) => {
    const identity = await requireAuth(ctx);
    const orgId = await getOrgIdFromJwt(ctx);
    if (!orgId) {
      throw new Error(
        "No active organisation — create your school organisation first"
      );
    }
    const userId = identity.subject;

    let school = await ctx.db
      .query("schools")
      .withIndex("by_clerkOrgId", (q) => q.eq("clerkOrgId", orgId))
      .first();

    let created = false;
    if (!school) {
      const trimmedTitle = leadershipTitle?.trim();
      const schoolId = await ctx.db.insert("schools", {
        clerkOrgId: orgId,
        name: name?.trim() || "My School",
        slug:
          slug?.trim() ||
          `school-${orgId.replace(/[^a-zA-Z0-9]/g, "").slice(-12)}`,
        primaryColor: "#2563eb",
        secondaryColor: "#64748b",
        leadershipTitle: trimmedTitle && trimmedTitle !== "__custom__" ? trimmedTitle : undefined,
      });
      school = await ctx.db.get(schoolId);
      created = true;
      await logAuditEntry(ctx, schoolId, "school.provisioned", { orgId });
    }
    if (!school) throw new Error("Failed to provision school");

    // Ensure the caller is the principal — a membership webhook (if any)
    // may have recorded them as a plain teacher before the school existed.
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", userId).eq("schoolId", school._id)
      )
      .first();
    if (member) {
      if (member.role !== LEADERSHIP_ROLE_KEY) {
        await ctx.db.patch(member._id, { role: LEADERSHIP_ROLE_KEY });
      }
    } else {
      await ctx.db.insert("members", {
        userId,
        schoolId: school._id,
        role: LEADERSHIP_ROLE_KEY,
      });
    }

    // ── Seed default roles (Phase 17A.2) ──────────────────────────
    // Only on first provisioning so re-runs stay idempotent.
    // The EAV module/section/field tree is NO LONGER auto-seeded here —
    // it is created during completeOnboarding based on the school's
    // actual module selections (spec §0: blank canvas).
    if (created) {
      await ctx.runMutation(internal.roles.seedDefaults, {
        schoolId: school._id,
      });
    }

    // ── Apply leadership title if provided ─────────────────────────
    const trimmedTitle = leadershipTitle?.trim();
    if (trimmedTitle && trimmedTitle !== "__custom__") {
      // Update the roles table display name for the leadership key
      const leadershipRole = await ctx.db
        .query("roles")
        .withIndex("by_schoolId_key", (q) =>
          q.eq("schoolId", school._id).eq("key", LEADERSHIP_ROLE_KEY)
        )
        .first();
      if (leadershipRole) {
        await ctx.db.patch(leadershipRole._id, { name: trimmedTitle });
      }
      // Cache on school row for fast lookup
      await ctx.db.patch(school._id, { leadershipTitle: trimmedTitle });
    }

    // Ensure a trial subscription exists so the paywall never traps a
    // freshly-provisioned school.
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", school._id))
      .first();
    if (!subscription) {
      const now = Date.now();
      await ctx.db.insert("subscriptions", {
        schoolId: school._id,
        planType: "monthly",
        status: "trial",
        trialStartedAt: now,
        trialEndsAt: now + TRIAL_DURATION_MS,
        currency: "KES",
        amount: 0,
      });
    }

    return { schoolId: school._id, created, orgId };
  },
});

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Get the current onboarding session for a school.
 */
export const getSession = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);
    return await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
  },
});

/**
 * Get step definitions for UI rendering.
 */
export const getSteps = query({
  args: {},
  handler: async () => {
    return STEPS;
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Create a new onboarding session for a school.
 */
export const createSession = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);

    // Check if session already exists
    const existing = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const sessionId = await ctx.db.insert("onboarding_sessions", {
      schoolId,
      currentStep: 1,
      status: "in_progress",
      collectedAnswers: {},
      conversationHistory: [],
      startedAt: now,
      lastActivityAt: now,
    });

    await logAuditEntry(ctx, schoolId, "onboarding.started", { sessionId });
    return sessionId;
  },
});

/**
 * Update the current step and save answers.
 */
export const updateStep = mutation({
  args: {
    schoolId: v.id("schools"),
    step: v.number(),
    answers: v.any(),
  },
  handler: async (ctx, { schoolId, step, answers }) => {
    await requirePrincipal(ctx, schoolId);

    const session = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!session) throw new Error("No onboarding session found");

    await ctx.db.patch(session._id, {
      currentStep: step,
      collectedAnswers: { ...session.collectedAnswers, ...answers },
      lastActivityAt: Date.now(),
    });

    return session._id;
  },
});

/**
 * Add a message to the conversation history.
 */
export const addMessage = mutation({
  args: {
    schoolId: v.id("schools"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, { schoolId, role, content }) => {
    await requirePrincipal(ctx, schoolId);

    const session = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!session) throw new Error("No onboarding session found");

    const history = [...session.conversationHistory, { role, content }];
    // Keep last 50 messages to limit context size
    const trimmedHistory = history.slice(-50);

    await ctx.db.patch(session._id, {
      conversationHistory: trimmedHistory,
      lastActivityAt: Date.now(),
    });
  },
});

/**
 * Complete the onboarding session.
 */
export const completeSession = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requirePrincipal(ctx, schoolId);

    const session = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!session) throw new Error("No onboarding session found");

    await ctx.db.patch(session._id, {
      status: "completed",
      completedAt: Date.now(),
      currentStep: 13,
    });

    await logAuditEntry(ctx, schoolId, "onboarding.completed", {
      sessionId: session._id,
      durationMs: Date.now() - session.startedAt,
    });

    return session._id;
  },
});

// Note: completeAndAssignTier was removed to avoid circular self-reference.
// The frontend calls completeSession (mutation) then analyzeAndAssignTier (action) separately.

// ── Module Key → EAV Module Name Mapping ──────────────────────────────
// Maps onboarding module keys (set via the toggles) to EAV module names
// seeded by seedFullTree. Modules not in this map are system-level (always on).
const MODULE_KEY_TO_EAV: Record<string, string> = {
  // Learners bucket modules
  health: "Health/Welfare",
  discipline: "Discipline",
  extracurricular: "Extracurricular",
  // Teaching staff modules
  lessonPlanning: "Lesson Planning",
  dutyRoster: "Duty Roster",
  staffAttendance: "Staff Attendance",
  hr: "HR & Performance",
  parentMeetings: "Parent Meetings",
  // Non-teaching staff modules
  medical: "Health/Clinic",
  transport: "Transport",
  gateLog: "Gate/Security",
  maintenance: "Facilities",
  bookHolds: "Library",
  // Administrative staff modules
  admissions: "Admissions",
  expenditures: "Expenditures",
  correspondence: "Correspondence",
  appointments: "Appointments",
};

// Facilities that gate certain modules (boarding facility → boarding module)
const FACILITY_TO_MODULE: Record<string, string[]> = {
  boarding: ["Boarding"],
  transport: ["Transport"],
  scienceLabs: ["Lesson Planning"],
};

// Reverse map: EAV module name → onboarding toggle key. Modules named here
// are "user-choice" modules — disabled unless the user picked the toggle.
const EAV_MODULE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(MODULE_KEY_TO_EAV).map(([key, name]) => [name, key])
);

/**
 * Complete onboarding AND apply the user's module/facility selections to the
 * EAV structure. This ensures only the modules the school actually chose
 * are left enabled — everything else (including custom facilities) is
 * disabled unless it was explicitly selected or gated by a facility flag.
 */
export const completeOnboarding = mutation({
  args: {
    schoolId: v.id("schools"),
    answers: v.any(),
  },
  handler: async (ctx, { schoolId, answers }) => {
    await requirePrincipal(ctx, schoolId);

    const session = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!session) throw new Error("No onboarding session found");

    // 1) Mark session complete
    await ctx.db.patch(session._id, {
      status: "completed",
      completedAt: Date.now(),
      currentStep: 13,
                    collectedAnswers: { ...session.collectedAnswers, ...answers },
    });

    await logAuditEntry(ctx, schoolId, "onboarding.completed", {
      sessionId: session._id,
      durationMs: Date.now() - session.startedAt,
    });

    // 2) Apply module selections — only enable modules the user chose
    const enabledModules: Record<string, boolean> = answers?.enabledModules ?? {};
    const facilities: Record<string, boolean> = answers?.facilities ?? {};
    const customFacilities: string[] = answers?.customFacilities ?? [];
    const isBoarding = answers?.isBoarding ?? false;

    // Build the set of EAV module names that should stay enabled
    const modulesToEnable = new Set<string>();

    // Always-on system modules (these should always be enabled)
    modulesToEnable.add("Student Record");
    modulesToEnable.add("Academics");
    modulesToEnable.add("Attendance");
    modulesToEnable.add("Documents");
    modulesToEnable.add("Communication");
    modulesToEnable.add("Finance");
    modulesToEnable.add("Promotion/Progression");

    // Enabling staff-record-like modules for each bucket is implicit

    // Map onboarding module keys to EAV module names
    for (const [key, enabled] of Object.entries(enabledModules)) {
      const eavModuleName = MODULE_KEY_TO_EAV[key];
      if (eavModuleName && enabled) {
        modulesToEnable.add(eavModuleName);
      }
    }

    // Facilities can enable certain modules (boarding → Boarding module, etc.)
    for (const [facilityKey, moduleNames] of Object.entries(FACILITY_TO_MODULE)) {
      const facilityEnabled = facilities[facilityKey] || (facilityKey === "boarding" && isBoarding);
      if (facilityEnabled) {
        for (const modName of moduleNames) modulesToEnable.add(modName);
      }
    }

    // Apply: disable user-choice modules that weren't selected. System-level
    // (always-on) modules are left untouched.
    const allModules = await ctx.db
      .query("modules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);

    let disabledCount = 0;
    for (const mod of allModules) {
      if (!mod.isSystem) continue;
      const toggleKey = EAV_MODULE_TO_KEY[mod.name];
      if (!toggleKey && mod.isEnabled !== false) continue;
      const shouldBeEnabled = modulesToEnable.has(mod.name);
      if (!shouldBeEnabled && mod.isEnabled !== false) {
        await ctx.db.patch(mod._id, { isEnabled: false });
        disabledCount++;
      }
    }

    // 2b) Seed EAV tree for SELECTED modules only (spec §0: blank canvas).
    // Previously the full tree was seeded during provisioning; now it is
    // created here based on the school's actual module selections.
    // Always-on system modules are always seeded.
    const alwaysOn = new Set([
      "Student Record", "Academics", "Attendance", "Documents",
      "Communication", "Finance", "Promotion/Progression",
      "Staff Record",
    ]);
    const seedFilter = new Set([...alwaysOn, ...modulesToEnable]);
    await ctx.runMutation(internal.seedFullTree.seedFullTree, {
      schoolId,
      modulesToSeed: Array.from(seedFilter),
    });

    // 3) Store custom facilities as a feature configuration so the AI
    //    agent and dashboard can read them without hardcoding.
    if (customFacilities.length > 0) {
      const existing = await ctx.db
        .query("feature_configurations")
        .withIndex("by_feature", (q) => q.eq("schoolId", schoolId).eq("featureName", "custom_facilities"))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { config: customFacilities });
      } else {
        await ctx.db.insert("feature_configurations", {
          schoolId,
          featureName: "custom_facilities",
          isEnabled: true,
          config: customFacilities,
        });
      }
    }

    // 4) Store fee configuration
    if (answers?.feePerStudent || answers?.feePerTerm) {
      const feeConfig: Record<string, unknown> = {
        feeSameForAllTerms: answers.feeSameForAllTerms ?? true,
        feeFrequency: answers.feeFrequency ?? "per term",
      };
      if (answers.feeSameForAllTerms) {
        feeConfig.feePerStudent = answers.feePerStudent;
      } else {
        feeConfig.feePerTerm = answers.feePerTerm;
      }
      const existing = await ctx.db
        .query("feature_configurations")
        .withIndex("by_feature", (q) => q.eq("schoolId", schoolId).eq("featureName", "fee_structure"))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { config: feeConfig });
      } else {
        await ctx.db.insert("feature_configurations", {
          schoolId,
          featureName: "fee_structure",
          isEnabled: Boolean(answers?.feePerStudent || answers?.feePerTerm),
          config: feeConfig,
        });
      }
    }

    return {
      sessionId: session._id,
      modulesDisabled: disabledCount,
      customFacilitiesAdded: customFacilities.length,
    };
  },
});

/**
 * Save AI-generated suggestions for a step.
 */
export const saveSuggestions = mutation({
  args: {
    schoolId: v.id("schools"),
    step: v.number(),
    suggestions: v.any(),
  },
  handler: async (ctx, { schoolId, step, suggestions }) => {
    await requirePrincipal(ctx, schoolId);

    const session = await ctx.db
      .query("onboarding_sessions")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .first();
    if (!session) throw new Error("No onboarding session found");

    const answersKey = `step_${step}_suggestions`;
    const collectedAnswers = { ...session.collectedAnswers };
    collectedAnswers[answersKey] = suggestions;

    await ctx.db.patch(session._id, {
      collectedAnswers,
      lastActivityAt: Date.now(),
    });
  },
});
