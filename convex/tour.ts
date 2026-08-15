import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireSchoolMembership, logAuditEntry } from "./helpers";

/**
 * Phase 2.3 — per-member guided-tour state.
 *
 * One doc per member per school. `dismissedAt` is the permanent dismissal:
 * the X button ends BOTH parts forever. `currentPart` lets a reload resume
 * the part in progress, and the completion timestamps let Settings offer a
 * fresh "Start tour" / "Reset" without re-asking.
 */

export const getTourState = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", identity.subject).eq("schoolId", schoolId)
      )
      .first();
    if (!member) return null;
    const state = await ctx.db
      .query("tour_states")
      .withIndex("by_memberId_schoolId", (q) =>
        q.eq("memberId", member._id).eq("schoolId", schoolId)
      )
      .first();
    if (!state) return null;
    return {
      currentPart: state.currentPart ?? null,
      dismissed: !!state.dismissedAt,
      part1Done: !!state.part1CompletedAt,
      part2Done: !!state.part2CompletedAt,
    };
  },
});

/**
 * Update the current member's tour state.
 *
 * - `part`            → switch to / resume a part (also used to start).
 * - `completePart`    → mark a part finished (part2 finishing clears currentPart).
 * - `dismissed: true` → permanent dismissal (both parts; X button).
 * - `dismissed: false` / `reset` → clear dismissal / completion timestamps
 *   so the tour can be replayed from Settings.
 */
export const updateTourState = mutation({
  args: {
    schoolId: v.id("schools"),
    part: v.optional(v.union(v.literal("part1"), v.literal("part2"))),
    completePart: v.optional(v.union(v.literal("part1"), v.literal("part2"))),
    dismissed: v.optional(v.boolean()),
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, { schoolId, part, completePart, dismissed, reset }) => {
    const identity = await requireAuth(ctx);
    await requireSchoolMembership(ctx, schoolId);
    const member = await ctx.db
      .query("members")
      .withIndex("by_userId_and_schoolId", (q) =>
        q.eq("userId", identity.subject).eq("schoolId", schoolId)
      )
      .first();
    if (!member) return null;

    const now = Date.now();
    const existing = await ctx.db
      .query("tour_states")
      .withIndex("by_memberId_schoolId", (q) =>
        q.eq("memberId", member._id).eq("schoolId", schoolId)
      )
      .first();

    const next = {
      memberId: member._id,
      schoolId,
      currentPart: existing?.currentPart,
      dismissedAt: existing?.dismissedAt,
      part1CompletedAt: existing?.part1CompletedAt,
      part2CompletedAt: existing?.part2CompletedAt,
      updatedAt: now,
    };

    if (dismissed === true) {
      next.dismissedAt = now;
      next.currentPart = undefined;
    }
    if (dismissed === false) {
      next.dismissedAt = undefined;
    }
    if (reset === true) {
      next.part1CompletedAt = undefined;
      next.part2CompletedAt = undefined;
      next.dismissedAt = undefined;
    }
    if (part !== undefined) {
      next.currentPart = part;
    }
    if (completePart === "part1") {
      next.part1CompletedAt = now;
    }
    if (completePart === "part2") {
      next.part2CompletedAt = now;
      next.currentPart = undefined;
    }

    if (existing) {
      await ctx.db.replace(existing._id, next);
    } else {
      await ctx.db.insert("tour_states", next);
    }

    await logAuditEntry(ctx, schoolId, "tour.updateState", {
      part: part ?? null,
      completePart: completePart ?? null,
      dismissed: dismissed ?? null,
      reset: reset ?? null,
    });

    return {
      currentPart: next.currentPart ?? null,
      dismissed: !!next.dismissedAt,
      part1Done: !!next.part1CompletedAt,
      part2Done: !!next.part2CompletedAt,
    };
  },
});
