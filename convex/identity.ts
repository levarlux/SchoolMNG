/**
 * Identity Engine (flexibility phase 2)
 *
 * Resolves rows from scattered files to the right student/staff member when
 * there is no admission/staff number to rely on. Strategy, per the agreed
 * design:
 *   1. Exact identifier (admNo / staffNo) — deterministic, always wins.
 *   2. Name matching — normalized token-set similarity with class/DOB boosts.
 *   3. Confident match  → auto-link (and remember via identity_links).
 *   4. Ambiguous match  → needs_review queue for a human to pick once.
 *   5. No match         → reported back, never silently dropped.
 *
 * identity_links rows remember resolutions by row signature so re-imports
 * (and other files describing the same person) link instantly.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requirePrincipal, requireSchoolMembership } from "./helpers";

// ── Normalization ───────────────────────────────────────────────────

/** Lowercase, strip punctuation/honorifics, collapse whitespace. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(mr|mrs|ms|miss|dr|prof|sir|madam|mama|bwana|fr|sister|br)\b/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .join(" ");
}

/** Sorted unique tokens of a normalized name (order-independent compare). */
export function nameTokens(name: string): string[] {
  const norm = normalizeName(name);
  if (!norm) return [];
  return [...new Set(norm.split(" "))].sort();
}

/** Token-set similarity 0..100 — handles typos and first/last name swaps. */
export function tokenSetRatio(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return Math.round((2 * inter) / union * 100);
}

/** True when one normalized name contains all tokens of the other. */
export function isSubsetMatch(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

export type PersonRef = {
  id: string;
  firstName: string;
  lastName: string;
  className?: string;
  dateOfBirth?: number;
};

export type Candidate = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
};

/**
 * Rank people against a file name. Class and DOB corroboration raise the
 * score; a candidate is only "strong" when it clearly beats the runner-up.
 */
export function rankCandidates(
  fileFirstName: string,
  fileLastName: string,
  className: string | undefined,
  dateOfBirth: number | undefined,
  people: PersonRef[]
): Candidate[] {
  const full = `${fileFirstName} ${fileLastName}`;
  const norm = normalizeName(full);
  if (!norm) return [];

  const scored: Candidate[] = [];
  for (const p of people) {
    const pFull = `${p.firstName} ${p.lastName}`;
    let score = tokenSetRatio(full, pFull);
    const reasons: string[] = [];
    if (score >= 90) reasons.push("Name matches");
    if (isSubsetMatch(full, pFull)) {
      score = Math.max(score, 90);
      reasons.push("Name matches (subset)");
    }
    // Class corroboration.
    if (className && p.className) {
      const fc = normalizeName(className);
      const pc = normalizeName(p.className);
      if (fc === pc) {
        score += 10;
        reasons.push("Class matches");
      } else if (pc.includes(fc) || fc.includes(pc)) {
        score += 5;
        reasons.push("Class similar");
      }
    }
    // DOB corroboration.
    if (dateOfBirth && p.dateOfBirth && Math.abs(dateOfBirth - p.dateOfBirth) < 1000 * 60 * 60 * 24) {
      score += 15;
      reasons.push("Date of birth matches");
    }
    scored.push({ id: p.id, name: pFull, score: Math.min(score, 100), reasons });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

/**
 * Decide what to do with a name-only match:
 *  - strong  → { status: "auto", candidate }
 *  - weak    → { status: "review", candidate } (top candidate offered)
 *  - none    → { status: "none" }
 */
export function decideMatch(
  candidates: Candidate[]
): { status: "auto" | "review" | "none"; candidate?: Candidate } {
  if (candidates.length === 0) return { status: "none" };
  const top = candidates[0];
  const second = candidates[1];
  const gap = second ? top.score - second.score : 100;
  if (top.score >= 88 && gap >= 8) return { status: "auto", candidate: top };
  if (top.score >= 62) return { status: "review", candidate: top };
  return { status: "none" };
}

/** Row signature used to remember links ("gideon waweru : grade 1 a"). */
export function identityRowKey(
  firstName: string,
  lastName: string,
  className?: string
): string {
  const name = normalizeName(`${firstName} ${lastName}`);
  const cls = className ? normalizeName(className) : "";
  return cls ? `${name} : ${cls}` : name;
}

// ── Queue ───────────────────────────────────────────────────────────

/** Rows awaiting a human decision (ambiguous name matches). */
export const listIdentityQueue = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("identity_links")
      .withIndex("by_schoolId_status", (q) =>
        q.eq("schoolId", schoolId).eq("status", "needs_review")
      )
      .order("desc")
      .take(200);
  },
});

/** Remembered link for a row signature (so re-imports are instant). */
export const getIdentityLinkByRowKey = internalQuery({
  args: {
    schoolId: v.id("schools"),
    entityKind: v.union(v.literal("student"), v.literal("staff")),
    rowKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("identity_links")
      .withIndex("by_schoolId_rowKey", (q) =>
        q.eq("schoolId", args.schoolId).eq("rowKey", args.rowKey)
      )
      .first();
  },
});

type ResolvedRef = Id<"students"> | Id<"teachers">;

/** Record a decision for an ambiguous row (human picked a candidate). */
export const resolveIdentityLink = mutation({
  args: {
    linkId: v.id("identity_links"),
    resolvedId: v.union(v.id("students"), v.id("teachers")),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    await requirePrincipal(ctx, link.schoolId);
    await ctx.db.patch(link._id, { resolvedId: args.resolvedId, status: "resolved" });
  },
});

/** Mark an ambiguous row as "not this person" (creates a new record later). */
export const dismissIdentityLink = mutation({
  args: { linkId: v.id("identity_links") },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");
    await requirePrincipal(ctx, link.schoolId);
    await ctx.db.patch(link._id, { status: "dismissed" });
  },
});

/**
 * Persist an ambiguous/auto row to the identity_links table. Called from
 * importers when a name match needs remembering or a human decision.
 */
export const recordIdentityLinkInternal = internalMutation({
  args: {
    schoolId: v.id("schools"),
    entityKind: v.union(v.literal("student"), v.literal("staff")),
    rowKey: v.string(),
    name: v.string(),
    resolvedId: v.optional(v.union(v.id("students"), v.id("teachers"))),
    confidence: v.number(),
    status: v.union(v.literal("auto"), v.literal("needs_review")),
    sourceFile: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("identity_links")
      .withIndex("by_schoolId_rowKey", (q) =>
        q.eq("schoolId", args.schoolId).eq("rowKey", args.rowKey)
      )
      .first();
    if (existing) {
      // Keep the highest-confidence state; never overwrite a human decision.
      if (existing.status === "resolved" || existing.status === "dismissed") return;
      if (args.status === "needs_review" && existing.status === "auto") return;
      await ctx.db.patch(existing._id, {
        status: args.status,
        confidence: Math.max(existing.confidence, args.confidence),
        resolvedId: args.resolvedId ?? existing.resolvedId,
        sourceFile: args.sourceFile ?? existing.sourceFile,
      });
      return;
    }
    await ctx.db.insert("identity_links", {
      schoolId: args.schoolId,
      entityKind: args.entityKind,
      rowKey: args.rowKey,
      name: args.name,
      resolvedId: args.resolvedId,
      confidence: args.confidence,
      status: args.status,
      sourceFile: args.sourceFile,
    });
  },
});

/**
 * Shared resolver used by importers. Takes a file row's identifiers and
 * returns the resolution so the caller can write/record accordingly.
 */
export type NameResolution =
  | { status: "matched"; id: string }
  | { status: "review"; linkId?: never; candidate: Candidate }
  | { status: "none" };

export function resolveName(
  firstName: string,
  lastName: string,
  className: string | undefined,
  dateOfBirth: number | undefined,
  people: PersonRef[]
): NameResolution {
  const candidates = rankCandidates(firstName, lastName, className, dateOfBirth, people);
  const decision = decideMatch(candidates);
  if (decision.status === "auto" && decision.candidate) {
    return { status: "matched", id: decision.candidate.id };
  }
  if (decision.status === "review" && decision.candidate) {
    return { status: "review", candidate: decision.candidate };
  }
  return { status: "none" };
}

// Keep the type import used (Id) — resolvedRef helper for typing clarity.
export type { ResolvedRef };
