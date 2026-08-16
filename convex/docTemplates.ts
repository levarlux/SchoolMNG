import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry } from "./helpers";
import type { Id } from "./_generated/dataModel";

// ── Validators ────────────────────────────────────────────────────

// Layout is deeply nested (sections → fields/columns → fieldId refs)
// and validated at runtime in the mutation handler. Schema uses v.any().
const layoutValidator = v.any();

// ── Queries ───────────────────────────────────────────────────────

/** List all templates for a school, optionally filtered by docType. */
export const list = query({
  args: {
    schoolId: v.id("schools"),
    docType: v.optional(v.union(
      v.literal("report_card"),
      v.literal("receipt"),
      v.literal("class_list"),
      v.literal("certificate"),
      v.literal("general"),
    )),
  },
  handler: async (ctx, { schoolId, docType }) => {
    await requireSchoolMembership(ctx, schoolId);
    if (docType) {
      return await ctx.db
        .query("doc_templates")
        .withIndex("by_schoolId_docType", (q) =>
          q.eq("schoolId", schoolId).eq("docType", docType)
        )
        .order("asc")
        .take(50);
    }
    return await ctx.db
      .query("doc_templates")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .order("asc")
      .take(100);
  },
});

/** Get a single template by ID. */
export const get = query({
  args: { templateId: v.id("doc_templates") },
  handler: async (ctx, { templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) return null;
    await requireSchoolMembership(ctx, template.schoolId);
    return template;
  },
});

/** Internal version of get for use by actions (no membership check needed). */
export const internalGet = internalQuery({
  args: { templateId: v.id("doc_templates") },
  handler: async (ctx, { templateId }) => {
    return await ctx.db.get(templateId);
  },
});

/** Get the default template for a docType, or the first available. */
export const getDefault = query({
  args: {
    schoolId: v.id("schools"),
    docType: v.union(
      v.literal("report_card"),
      v.literal("receipt"),
      v.literal("class_list"),
      v.literal("certificate"),
      v.literal("general"),
    ),
  },
  handler: async (ctx, { schoolId, docType }) => {
    await requireSchoolMembership(ctx, schoolId);
    // Prefer isDefault=true, then first created
    const defaults = await ctx.db
      .query("doc_templates")
      .withIndex("by_schoolId_docType", (q) =>
        q.eq("schoolId", schoolId).eq("docType", docType)
      )
      .order("asc")
      .take(10);
    return defaults.find((t) => t.isDefault) ?? defaults[0] ?? null;
  },
});

// ── Mutations ─────────────────────────────────────────────────────

/** Create a new document template. */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    docType: v.union(
      v.literal("report_card"),
      v.literal("receipt"),
      v.literal("class_list"),
      v.literal("certificate"),
      v.literal("general"),
    ),
    description: v.optional(v.string()),
    layout: layoutValidator,
    pageSize: v.optional(v.union(
      v.literal("letter"),
      v.literal("a4"),
      v.literal("legal"),
    )),
    isDefault: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePrincipal(ctx, args.schoolId);
    const now = Date.now();
    const templateId = await ctx.db.insert("doc_templates", {
      ...args,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });
    await logAuditEntry(ctx, args.schoolId, "template.created", {
      templateId,
      name: args.name,
      docType: args.docType,
    });
    return templateId;
  },
});

/** Update a document template's name, layout, or settings. */
export const update = mutation({
  args: {
    templateId: v.id("doc_templates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    layout: v.optional(layoutValidator),
    pageSize: v.optional(v.union(
      v.literal("letter"),
      v.literal("a4"),
      v.literal("legal"),
    )),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    await requirePrincipal(ctx, template.schoolId);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.layout !== undefined) updates.layout = args.layout;
    if (args.pageSize !== undefined) updates.pageSize = args.pageSize;

    // If setting as default, clear isDefault on other templates of same docType
    if (args.isDefault === true) {
      const siblings = await ctx.db
        .query("doc_templates")
        .withIndex("by_schoolId_docType", (q) =>
          q.eq("schoolId", template.schoolId).eq("docType", template.docType)
        )
        .take(20);
      for (const s of siblings) {
        if (s._id !== args.templateId && s.isDefault) {
          await ctx.db.patch(s._id, { isDefault: false });
        }
      }
      updates.isDefault = true;
    } else if (args.isDefault === false) {
      updates.isDefault = false;
    }

    await ctx.db.patch(args.templateId, updates);
    await logAuditEntry(ctx, template.schoolId, "template.updated", {
      templateId: args.templateId,
    });
    return args.templateId;
  },
});

/** Delete a non-system template. System templates can only be modified. */
export const remove = mutation({
  args: { templateId: v.id("doc_templates") },
  handler: async (ctx, { templateId }) => {
    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");
    await requirePrincipal(ctx, template.schoolId);
    if (template.isSystem) {
      throw new Error("System templates cannot be deleted. Modify the layout instead.");
    }
    await ctx.db.delete(templateId);
    await logAuditEntry(ctx, template.schoolId, "template.deleted", {
      templateId,
      name: template.name,
    });
    return templateId;
  },
});

/** Duplicate a template (create a copy with a new name). */
export const duplicate = mutation({
  args: {
    templateId: v.id("doc_templates"),
    name: v.string(),
  },
  handler: async (ctx, { templateId, name }) => {
    const source = await ctx.db.get(templateId);
    if (!source) throw new Error("Source template not found");
    await requirePrincipal(ctx, source.schoolId);
    const now = Date.now();
    const newId = await ctx.db.insert("doc_templates", {
      schoolId: source.schoolId,
      name,
      docType: source.docType,
      description: source.description,
      layout: source.layout,
      pageSize: source.pageSize,
      isDefault: false,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    });
    await logAuditEntry(ctx, source.schoolId, "template.duplicated", {
      sourceId: templateId,
      newId,
      name,
    });
    return newId;
  },
});
