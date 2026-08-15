/**
 * AI Session Store (16-ai-agent-charter.md §1)
 *
 * Internal-only helpers that let the AI actions persist one Mistral
 * conversation per (school, entry point, user) and build a live, school-
 * scoped context pack for every agent call.
 *
 * Session isolation rule: every row is keyed by schoolId, and the context
 * pack is always built from the caller's own school data only — the agent
 * never sees another school's records or history.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { resolveEffectiveAccess } from "./helpers";
import { Id } from "./_generated/dataModel";

const MAX_HISTORY = 40;

// ── Session CRUD ────────────────────────────────────────────────────

export const getSession = internalQuery({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
    entryPoint: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("ai_sessions")
      .withIndex("by_schoolId_user_entry", (q) =>
        q
          .eq("schoolId", args.schoolId)
          .eq("userId", args.userId)
          .eq("entryPoint", args.entryPoint)
      )
      .first();
    if (!row) return null;
    // Return a plain projection (not the raw document) so the call site never
    // has to resolve the full ai_sessions document type through Convex's
    // generated action map (avoids TS7022 circular-type inference).
    return {
      conversationId: row.conversationId ?? null,
      moduleName: row.moduleName ?? null,
      history: row.history,
    };
  },
});

export const upsertSession = internalMutation({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
    entryPoint: v.string(),
    moduleName: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ai_sessions")
      .withIndex("by_schoolId_user_entry", (q) =>
        q
          .eq("schoolId", args.schoolId)
          .eq("userId", args.userId)
          .eq("entryPoint", args.entryPoint)
      )
      .first();

    const history = args.messages.slice(-MAX_HISTORY);
    const lastActivityAt = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        moduleName: args.moduleName ?? existing.moduleName,
        conversationId: args.conversationId ?? existing.conversationId,
        history,
        lastActivityAt,
      });
      return { sessionId: existing._id, created: false };
    }

    const sessionId = await ctx.db.insert("ai_sessions", {
      schoolId: args.schoolId,
      userId: args.userId,
      entryPoint: args.entryPoint,
      moduleName: args.moduleName,
      conversationId: args.conversationId,
      history,
      createdAt: Date.now(),
      lastActivityAt,
    });
    return { sessionId, created: true };
  },
});

export const resetSession = internalMutation({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
    entryPoint: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ai_sessions")
      .withIndex("by_schoolId_user_entry", (q) =>
        q
          .eq("schoolId", args.schoolId)
          .eq("userId", args.userId)
          .eq("entryPoint", args.entryPoint)
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return existing?.conversationId ?? null;
  },
});

// ── School context pack ─────────────────────────────────────────────
//
// The "app" of a school that the agent gets access to on every call:
// school identity, current term, enabled modules, and live (bounded)
// snapshots of key record types — all filtered by schoolId.

export const getSchoolContext = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const school = await ctx.db.get(schoolId);
    if (!school) return null;

    const [modules, terms, students, classes, teachers, books, borrowings] =
      await Promise.all([
        ctx.db
          .query("modules")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("terms")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(50),
        ctx.db
          .query("students")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("classes")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("teachers")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("books")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(500),
        ctx.db
          .query("borrowings")
          .withIndex("by_status", (q) =>
            q.eq("schoolId", schoolId).eq("status", "borrowed")
          )
          .take(500),
      ]);

    const currentTerm = terms.find((t) => t.status === "active") ?? terms[0] ?? null;

    return {
      school: {
        name: school.name,
        slug: school.slug,
        status: school.status ?? "active",
      },
      currentTerm: currentTerm
        ? { name: currentTerm.name, year: currentTerm.year, status: currentTerm.status ?? null }
        : null,
      modules: modules.filter((m) => m.isEnabled).map((m) => m.name),
      totals: {
        students: students.length,
        classes: classes.length,
        teachers: teachers.length,
        books: books.length,
        activeBorrowings: borrowings.length,
      },
      recentStudents: students
        .slice(0, 10)
        .map((s) => ({ name: `${s.firstName} ${s.lastName}`, admNo: s.admNo })),
    };
  },
});

// ── Permission-filtered context (P2 #16 — AI agent hard-boundary) ──

/**
 * Permission map: module name → access level.
 * Leadership/superadmin roles get all modules.
 * Others only get modules their role has view/edit access on.
 */
export const getPermissionFilteredModules = internalQuery({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
  },
  handler: async (ctx, { schoolId, userId }) => {
    // Resolve caller's member record
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", userId).eq("schoolId", schoolId)
      )
      .first();
    if (!member) return null;

    // Resolve the role document
    const roleDoc = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", member.role)
      )
      .first();
    if (!roleDoc) return null;

    // Get all enabled modules for the school
    const modules = await ctx.db
      .query("modules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(200);

    const enabledModules = modules.filter((m) => m.isEnabled);

    // Check each module's permission for this role
    const allowedModules: { name: string; access: "none" | "view" | "edit" }[] = [];
    for (const mod of enabledModules) {
      const access = await resolveEffectiveAccess(ctx, roleDoc._id, "module", mod._id as string);
      if (access !== "none") {
        allowedModules.push({ name: mod.name, access });
      }
    }

    return {
      roleKey: roleDoc.key,
      isLeadership: roleDoc.key === "principal",
      allowedModules,
    };
  },
});

/**
 * Filter the school context pack to only include modules the caller can access.
 * For leadership roles, returns the full context unchanged.
 */
export const getFilteredSchoolContext = internalQuery({
  args: {
    schoolId: v.id("schools"),
    userId: v.string(),
  },
  handler: async (ctx, { schoolId, userId }) => {
    // Get the full school context
    const school = await ctx.db.get(schoolId);
    if (!school) return null;

    const [modules, terms, students, classes, teachers, books, borrowings] =
      await Promise.all([
        ctx.db
          .query("modules")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("terms")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(50),
        ctx.db
          .query("students")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("classes")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("teachers")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(200),
        ctx.db
          .query("books")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
          .take(500),
        ctx.db
          .query("borrowings")
          .withIndex("by_status", (q) =>
            q.eq("schoolId", schoolId).eq("status", "borrowed")
          )
          .take(500),
      ]);

    const currentTerm = terms.find((t) => t.status === "active") ?? terms[0] ?? null;

    // Resolve caller's permissions
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", userId).eq("schoolId", schoolId)
      )
      .first();
    if (!member) return null;

    const roleDoc = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", member.role)
      )
      .first();
    if (!roleDoc) return null;

    const isLeadership = roleDoc.key === "principal";

    // Filter modules by permission
    const enabledModules = modules.filter((m) => m.isEnabled);
    const allowedModuleNames: string[] = [];
    const allowedModuleAccess: Record<string, string> = {};

    for (const mod of enabledModules) {
      const access = await resolveEffectiveAccess(ctx, roleDoc._id, "module", mod._id as string);
      if (access !== "none") {
        allowedModuleNames.push(mod.name);
        allowedModuleAccess[mod.name] = access;
      }
    }

    // Filter students by permission: leadership sees all, others see limited set
    const filteredStudents = isLeadership
      ? students.slice(0, 10).map((s) => ({ name: `${s.firstName} ${s.lastName}`, admNo: s.admNo }))
      : students.slice(0, 5).map((s) => ({ name: `${s.firstName} ${s.lastName}`, admNo: s.admNo }));

    return {
      school: {
        name: school.name,
        slug: school.slug,
        status: school.status ?? "active",
      },
      currentTerm: currentTerm
        ? { name: currentTerm.name, year: currentTerm.year, status: currentTerm.status ?? null }
        : null,
      modules: allowedModuleNames,
      moduleAccess: allowedModuleAccess,
      isLeadership,
      totals: {
        students: students.length,
        classes: classes.length,
        teachers: teachers.length,
        books: books.length,
        activeBorrowings: borrowings.length,
      },
      recentStudents: filteredStudents,
    };
  },
});
