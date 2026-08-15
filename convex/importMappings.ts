import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requirePrincipal, requireSchoolMembership, logAuditEntry } from "./helpers";

/**
 * Persistent per-kind column mapping profiles (Phase 17C).
 *
 * After a successful import, Import Studio saves the file's column mapping as
 * a profile for that entity kind. The next time a file of the same kind is
 * uploaded, the profile is offered as the starting mapping (in Bulk Operations
 * AND Onboarding) so schools with consistent templates don't re-map every time.
 *
 * `mapping` maps canonical field keys (system keys like "firstName", or EAV
 * keys like "eav:<fieldId>") to the source file header they came from.
 */

const ImportKind = v.union(
  v.literal("students"),
  v.literal("staff"),
  v.literal("fees"),
  v.literal("attendance"),
  v.literal("fee-payments"),
  v.literal("subjects"),
  v.literal("classes"),
  v.literal("terms"),
);

export const listMappings = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("import_mappings")
      .withIndex("by_schoolId_kind", (q) => q.eq("schoolId", args.schoolId))
      .take(100);
  },
});

export const getMapping = query({
  args: { schoolId: v.id("schools"), kind: ImportKind },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("import_mappings")
      .withIndex("by_schoolId_kind", (q) => q.eq("schoolId", args.schoolId).eq("kind", args.kind))
      .first();
  },
});

export const saveMapping = mutation({
  args: {
    schoolId: v.id("schools"),
    kind: ImportKind,
    mapping: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    const existing = await ctx.db
      .query("import_mappings")
      .withIndex("by_schoolId_kind", (q) => q.eq("schoolId", args.schoolId).eq("kind", args.kind))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        mapping: args.mapping,
        updatedBy: identity?.subject ?? "unknown",
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("import_mappings", {
        schoolId: args.schoolId,
        kind: args.kind,
        mapping: args.mapping,
        updatedBy: identity?.subject ?? "unknown",
        updatedAt: Date.now(),
      });
    }
    await logAuditEntry(ctx, args.schoolId, "importMapping.save", {
      kind: args.kind,
      fields: Object.keys(args.mapping).length,
    });
  },
});

export const deleteMapping = mutation({
  args: { id: v.id("import_mappings") },
  handler: async (ctx, args) => {
    const mapping = await ctx.db.get(args.id);
    if (!mapping) throw new Error("Mapping profile not found");
    await requirePrincipal(ctx, mapping.schoolId);
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, mapping.schoolId, "importMapping.delete", {
      kind: mapping.kind,
    });
  },
});
