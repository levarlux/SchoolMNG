import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";

const inputTypeValidator = v.union(
  v.literal("text_short"),
  v.literal("text_long"),
  v.literal("number"),
  v.literal("date"),
  v.literal("boolean"),
  v.literal("dropdown_single"),
  v.literal("dropdown_multi"),
  v.literal("file"),
);

export const listBySection = query({
  args: { sectionId: v.id("sections") },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section) throw new Error("Section not found");
    await requireSchoolMembership(ctx, section.schoolId);
    return await ctx.db
      .query("fields")
      .withIndex("by_sectionId", (q) => q.eq("sectionId", args.sectionId))
      .order("asc")
      .take(100);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("fields")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("asc")
      .take(500);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    sectionId: v.id("sections"),
    name: v.string(),
    inputType: inputTypeValidator,
    options: v.optional(v.array(v.string())),
    isRequired: v.boolean(),
    isEnabled: v.optional(v.boolean()),
    isSensitive: v.optional(v.boolean()),
    aliases: v.array(v.string()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const id = await ctx.db.insert("fields", {
      schoolId: args.schoolId,
      sectionId: args.sectionId,
      name: args.name,
      inputType: args.inputType,
      options: args.options,
      isRequired: args.isRequired,
      isCustom: true,
      isSystem: false,
      isEnabled: args.isEnabled ?? true,
      createdBy: undefined,
      aliases: args.aliases,
      order: args.order,
      isSensitive: args.isSensitive,
    });
    await logAuditEntry(ctx, args.schoolId, "field.create", {
      fieldId: id,
      sectionId: args.sectionId,
      name: args.name,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("fields"),
    name: v.optional(v.string()),
    inputType: v.optional(inputTypeValidator),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    isEnabled: v.optional(v.boolean()),
    isSensitive: v.optional(v.boolean()),
    aliases: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const field = await ctx.db.get(args.id);
    if (!field) throw new Error("Field not found");
    await requirePrincipal(ctx, field.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.inputType !== undefined) updates.inputType = fields.inputType;
    if (fields.options !== undefined) updates.options = fields.options;
    if (fields.isRequired !== undefined) updates.isRequired = fields.isRequired;
    if (fields.isEnabled !== undefined) updates.isEnabled = fields.isEnabled;
    if (fields.isSensitive !== undefined) updates.isSensitive = fields.isSensitive;
    if (fields.aliases !== undefined) updates.aliases = fields.aliases;
    if (fields.order !== undefined) updates.order = fields.order;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, field.schoolId, "field.update", {
      fieldId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("fields") },
  handler: async (ctx, args) => {
    const field = await ctx.db.get(args.id);
    if (!field) throw new Error("Field not found");
    await requirePrincipal(ctx, field.schoolId);
    // Soft-delete: archive instead of permanent delete. The field is hidden
    // from record forms but its fieldValues are preserved for historical data.
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await logAuditEntry(ctx, field.schoolId, "field.remove", {
      fieldId: args.id,
      name: field.name,
    });
  },
});
