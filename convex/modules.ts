import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    bucket: v.optional(
      v.union(
        v.literal("learner"),
        v.literal("teaching_staff"),
        v.literal("non_teaching_staff"),
        v.literal("admin_staff"),
        v.literal("leadership"),
        v.literal("platform"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    let q = ctx.db
      .query("modules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("asc");
    if (args.bucket) {
      q = ctx.db
        .query("modules")
        .withIndex("by_schoolId_bucket", (q) =>
          q.eq("schoolId", args.schoolId).eq("bucket", args.bucket!)
        )
        .order("asc");
    }
    return await q.take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    bucket: v.union(
      v.literal("learner"),
      v.literal("teaching_staff"),
      v.literal("non_teaching_staff"),
      v.literal("admin_staff"),
      v.literal("leadership"),
      v.literal("platform"),
    ),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const id = await ctx.db.insert("modules", {
      schoolId: args.schoolId,
      bucket: args.bucket,
      name: args.name,
      description: args.description,
      order: args.order,
      isEnabled: true,
      isCustom: true,
      isSystem: false,
    });
    await logAuditEntry(ctx, args.schoolId, "module.create", {
      moduleId: id,
      name: args.name,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("modules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.id);
    if (!mod) throw new Error("Module not found");
    await requirePrincipal(ctx, mod.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.order !== undefined) updates.order = fields.order;
    if (fields.isEnabled !== undefined) updates.isEnabled = fields.isEnabled;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, mod.schoolId, "module.update", {
      moduleId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("modules") },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.id);
    if (!mod) throw new Error("Module not found");
    await requirePrincipal(ctx, mod.schoolId);
    // Remove associated sections
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_moduleId", (q) => q.eq("moduleId", args.id))
      .take(100);
    for (const section of sections) {
      // Remove associated fields
      const fields = await ctx.db
        .query("fields")
        .withIndex("by_sectionId", (q) => q.eq("sectionId", section._id))
        .take(100);
      for (const field of fields) {
        await ctx.db.delete(field._id);
      }
      await ctx.db.delete(section._id);
    }
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, mod.schoolId, "module.remove", {
      moduleId: args.id,
      name: mod.name,
    });
  },
});
