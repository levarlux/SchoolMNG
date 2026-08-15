/**
 * EAV seed data — Phase 1.2 (deprecated in 17A.2).
 *
 * The full 5-bucket module/section/field template now lives in
 * convex/seedFullTree.ts. This file keeps `seedLearnerModule` as a thin
 * wrapper so any existing `internal.seedEAV.seedLearnerModule` call sites
 * keep working without changes.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { seedFullTreeData } from "./seedFullTree";

export const seedLearnerModule = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await seedFullTreeData(ctx, args.schoolId);
    return { ok: true };
  },
});