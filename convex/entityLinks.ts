import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

// ── Validators ─────────────────────────────────────────────────────

const createLinkArgs = {
  schoolId: v.id("schools"),
  linkType: v.string(),
  fromTable: v.string(),
  fromId: v.string(),
  toTable: v.string(),
  toId: v.string(),
  role: v.optional(v.string()),
  weight: v.optional(v.number()),
  startDate: v.optional(v.float64()),
  endDate: v.optional(v.float64()),
  notes: v.optional(v.string()),
};

// ── Queries ────────────────────────────────────────────────────────

/** List all active links from a specific entity. */
export const listByFromEntity = query({
  args: {
    fromTable: v.string(),
    fromId: v.string(),
    linkType: v.optional(v.string()),
  },
  handler: async (ctx, { fromTable, fromId, linkType }) => {
    const links = linkType
      ? await ctx.db
          .query("entity_links")
          .withIndex("by_fromTable_fromId_linkType", (q) =>
            q.eq("fromTable", fromTable).eq("fromId", fromId).eq("linkType", linkType)
          )
          .take(500)
      : await ctx.db
          .query("entity_links")
          .withIndex("by_fromTable_fromId", (q) =>
            q.eq("fromTable", fromTable).eq("fromId", fromId)
          )
          .take(500);

    // Tenant guard: verify caller belongs to the school of the first link.
    if (links.length > 0) {
      await requireSchoolMembership(ctx, links[0].schoolId);
    }
    return links.filter((l) => l.isActive);
  },
});

/** List all active links to a specific entity. */
export const listByToEntity = query({
  args: {
    toTable: v.string(),
    toId: v.string(),
    linkType: v.optional(v.string()),
  },
  handler: async (ctx, { toTable, toId, linkType }) => {
    const links = linkType
      ? await ctx.db
          .query("entity_links")
          .withIndex("by_toTable_toId_linkType", (q) =>
            q.eq("toTable", toTable).eq("toId", toId).eq("linkType", linkType)
          )
          .take(500)
      : await ctx.db
          .query("entity_links")
          .withIndex("by_toTable_toId", (q) =>
            q.eq("toTable", toTable).eq("toId", toId)
          )
          .take(500);

    if (links.length > 0) {
      await requireSchoolMembership(ctx, links[0].schoolId);
    }
    return links.filter((l) => l.isActive);
  },
});

/** List all links of a given type in a school. */
export const listByLinkType = query({
  args: {
    schoolId: v.id("schools"),
    linkType: v.string(),
  },
  handler: async (ctx, { schoolId, linkType }) => {
    await requireSchoolMembership(ctx, schoolId);
    return await ctx.db
      .query("entity_links")
      .withIndex("by_schoolId_linkType", (q) =>
        q.eq("schoolId", schoolId).eq("linkType", linkType)
      )
      .take(500);
  },
});

/** Get a single link by ID. */
export const get = query({
  args: { id: v.id("entity_links") },
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (!link) return null;
    await requireSchoolMembership(ctx, link.schoolId);
    return link;
  },
});

// ── Mutations ──────────────────────────────────────────────────────

/** Create a new entity link. Idempotent — returns existing link if same (school, linkType, from, to) already exists. */
export const create = mutation({
  args: createLinkArgs,
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    // Idempotency: check for existing identical link
    const existing = await ctx.db
      .query("entity_links")
      .withIndex("by_fromTable_fromId_linkType", (q) =>
        q
          .eq("fromTable", args.fromTable)
          .eq("fromId", args.fromId)
          .eq("linkType", args.linkType)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("toTable"), args.toTable),
          q.eq(q.field("toId"), args.toId),
          q.eq(q.field("isActive"), true)
        )
      )
      .first();

    if (existing) return existing._id;

    const id = await ctx.db.insert("entity_links", {
      ...args,
      isActive: true,
    });

    await logAuditEntry(ctx, args.schoolId, "entity_link.create", {
      linkId: id,
      linkType: args.linkType,
      from: `${args.fromTable}:${args.fromId}`,
      to: `${args.toTable}:${args.toId}`,
    });

    return id;
  },
});

/** Soft-delete a link (set isActive = false). */
export const remove = mutation({
  args: { id: v.id("entity_links") },
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new Error("Link not found");
    await requireSchoolMembership(ctx, link.schoolId);

    await ctx.db.patch(id, { isActive: false });

    await logAuditEntry(ctx, link.schoolId, "entity_link.remove", {
      linkId: id,
      linkType: link.linkType,
      from: `${link.fromTable}:${link.fromId}`,
      to: `${link.toTable}:${link.toId}`,
    });
  },
});

/** Permanently delete a link (admin only). */
export const hardDelete = mutation({
  args: { id: v.id("entity_links") },
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new Error("Link not found");
    await requireSchoolMembership(ctx, link.schoolId);

    await ctx.db.delete(id);

    await logAuditEntry(ctx, link.schoolId, "entity_link.hardDelete", {
      linkId: id,
      linkType: link.linkType,
      from: `${link.fromTable}:${link.fromId}`,
      to: `${link.toTable}:${link.toId}`,
    });
  },
});

/** Update metadata on a link. */
export const update = mutation({
  args: {
    id: v.id("entity_links"),
    role: v.optional(v.string()),
    weight: v.optional(v.number()),
    startDate: v.optional(v.float64()),
    endDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new Error("Link not found");
    await requireSchoolMembership(ctx, link.schoolId);

    const updates: Record<string, unknown> = {};
    if (fields.role !== undefined) updates.role = fields.role;
    if (fields.weight !== undefined) updates.weight = fields.weight;
    if (fields.startDate !== undefined) updates.startDate = fields.startDate;
    if (fields.endDate !== undefined) updates.endDate = fields.endDate;
    if (fields.notes !== undefined) updates.notes = fields.notes;
    if (fields.isActive !== undefined) updates.isActive = fields.isActive;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }

    await logAuditEntry(ctx, link.schoolId, "entity_link.update", {
      linkId: id,
      updates,
    });
  },
});

/** Bulk create links (e.g. for batch assignments). */
export const bulkCreate = mutation({
  args: {
    schoolId: v.id("schools"),
    links: v.array(
      v.object({
        linkType: v.string(),
        fromTable: v.string(),
        fromId: v.string(),
        toTable: v.string(),
        toId: v.string(),
        role: v.optional(v.string()),
        weight: v.optional(v.number()),
        startDate: v.optional(v.float64()),
        endDate: v.optional(v.float64()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { schoolId, links }) => {
    await requireSchoolMembership(ctx, schoolId);

    let created = 0;
    let skipped = 0;

    for (const link of links) {
      // Idempotency check
      const existing = await ctx.db
        .query("entity_links")
        .withIndex("by_fromTable_fromId_linkType", (q) =>
          q
            .eq("fromTable", link.fromTable)
            .eq("fromId", link.fromId)
            .eq("linkType", link.linkType)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("toTable"), link.toTable),
            q.eq(q.field("toId"), link.toId),
            q.eq(q.field("isActive"), true)
          )
        )
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("entity_links", {
        schoolId,
        ...link,
        isActive: true,
      });
      created++;
    }

    await logAuditEntry(ctx, schoolId, "entity_link.bulkCreate", {
      total: links.length,
      created,
      skipped,
    });

    return { created, skipped };
  },
});

/** Bulk remove all links of a given type from an entity. */
export const bulkRemoveByEntity = mutation({
  args: {
    schoolId: v.id("schools"),
    linkType: v.string(),
    fromTable: v.string(),
    fromId: v.string(),
  },
  handler: async (ctx, { schoolId, linkType, fromTable, fromId }) => {
    await requireSchoolMembership(ctx, schoolId);

    const links = await ctx.db
      .query("entity_links")
      .withIndex("by_fromTable_fromId_linkType", (q) =>
        q.eq("fromTable", fromTable).eq("fromId", fromId).eq("linkType", linkType)
      )
      .take(500);

    let removed = 0;
    for (const link of links) {
      if (link.schoolId !== schoolId) continue;
      if (!link.isActive) continue;
      await ctx.db.patch(link._id, { isActive: false });
      removed++;
    }

    await logAuditEntry(ctx, schoolId, "entity_link.bulkRemove", {
      linkType,
      from: `${fromTable}:${fromId}`,
      removed,
    });

    return { removed };
  },
});
