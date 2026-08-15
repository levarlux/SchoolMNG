import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

export const listBySchool = query({
  args: {
    schoolId: v.id("schools"),
    documentType: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("compliance_documents")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc");

    let results = await q.take(500);

    if (args.documentType) {
      results = results.filter((d) => d.documentType === args.documentType);
    }
    if (args.status) {
      results = results.filter((d) => d.status === args.status);
    }

    return results;
  },
});

export const get = query({
  args: { id: v.id("compliance_documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    documentType: v.union(
      v.literal("registration"),
      v.literal("inspection"),
      v.literal("policy"),
      v.literal("certificate"),
      v.literal("other")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    fileStorageId: v.optional(v.string()),
    renewalDate: v.optional(v.float64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("compliance_documents", {
      ...args,
      status: "active",
      uploadedBy: identity?.subject ?? "system",
      uploadedAt: Date.now(),
    });
    await logAuditEntry(ctx, args.schoolId, "compliance.create", {
      documentId: id,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("compliance_documents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    renewalDate: v.optional(v.float64()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expired"),
        v.literal("pending_renewal")
      )
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Document not found");

    const patchData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patchData[key] = value;
    }

    await ctx.db.patch(id, patchData);
    await logAuditEntry(ctx, existing.schoolId, "compliance.update", {
      documentId: id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("compliance_documents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Document not found");
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, existing.schoolId, "compliance.remove", {
      documentId: args.id,
    });
  },
});

export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("compliance_documents")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);

    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    return {
      total: docs.length,
      active: docs.filter((d) => d.status === "active").length,
      expired: docs.filter((d) => d.status === "expired").length,
      pendingRenewal: docs.filter((d) => d.status === "pending_renewal").length,
      renewalSoon: docs.filter(
        (d) =>
          d.renewalDate &&
          d.renewalDate <= thirtyDaysFromNow &&
          d.renewalDate > now &&
          d.status === "active"
      ).length,
    };
  },
});
