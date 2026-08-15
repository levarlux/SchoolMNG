import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";

export const listByModule = query({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, args) => {
    const mod = await ctx.db.get(args.moduleId);
    if (!mod) throw new Error("Module not found");
    await requireSchoolMembership(ctx, mod.schoolId);
    return await ctx.db
      .query("sections")
      .withIndex("by_moduleId", (q) => q.eq("moduleId", args.moduleId))
      .order("asc")
      .take(100);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("sections")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("asc")
      .take(200);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    moduleId: v.id("modules"),
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    isRepeatable: v.optional(v.boolean()),
    isSensitive: v.optional(v.boolean()),
    parentId: v.optional(v.id("sections")),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent) throw new Error("Parent section not found");
      if (parent.moduleId !== args.moduleId) throw new Error("Parent section must belong to the same module");
    }
    const id = await ctx.db.insert("sections", {
      schoolId: args.schoolId,
      moduleId: args.moduleId,
      name: args.name,
      description: args.description,
      order: args.order,
      isEnabled: true,
      isSystem: false,
      isRepeatable: args.isRepeatable,
      isSensitive: args.isSensitive,
      parentId: args.parentId,
    });
    await logAuditEntry(ctx, args.schoolId, "section.create", {
      sectionId: id,
      moduleId: args.moduleId,
      name: args.name,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("sections"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    isEnabled: v.optional(v.boolean()),
    isRepeatable: v.optional(v.boolean()),
    isSensitive: v.optional(v.boolean()),
    parentId: v.optional(v.id("sections")),
  },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.id);
    if (!section) throw new Error("Section not found");
    await requirePrincipal(ctx, section.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.order !== undefined) updates.order = fields.order;
    if (fields.isEnabled !== undefined) updates.isEnabled = fields.isEnabled;
    if (fields.isRepeatable !== undefined) updates.isRepeatable = fields.isRepeatable;
    if (fields.isSensitive !== undefined) updates.isSensitive = fields.isSensitive;
    if (fields.parentId !== undefined) updates.parentId = fields.parentId;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, section.schoolId, "section.update", {
      sectionId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("sections") },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.id);
    if (!section) throw new Error("Section not found");
    await requirePrincipal(ctx, section.schoolId);
    // Remove associated fields
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_sectionId", (q) => q.eq("sectionId", args.id))
      .take(100);
    for (const field of fields) {
      await ctx.db.delete(field._id);
    }
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, section.schoolId, "section.remove", {
      sectionId: args.id,
      name: section.name,
    });
  },
});
