import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

/** List guardians by school */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guardians")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

/** Search guardians by name */
export const searchByName = query({
  args: {
    schoolId: v.id("schools"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.query.length < 2) return [];
    const results = await ctx.db
      .query("guardians")
      .withSearchIndex("search_name", (q) =>
        q.search("firstName", args.query).eq("schoolId", args.schoolId)
      )
      .take(20);
    return results;
  },
});

/** Get single guardian */
export const get = query({
  args: { id: v.id("guardians") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Get guardian by phone */
export const getByPhone = query({
  args: {
    schoolId: v.id("schools"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guardians")
      .withIndex("by_phone", (q) =>
        q.eq("schoolId", args.schoolId).eq("phone", args.phone)
      )
      .first();
  },
});

/** Get all linked students for a guardian */
export const getLinkedStudents = query({
  args: { guardianId: v.id("guardians") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("guardian_links")
      .withIndex("by_guardianId", (q) => q.eq("guardianId", args.guardianId))
      .take(20);

    const results: Array<{
      _id: string;
      firstName: string;
      lastName: string;
      admNo: string;
      isPrimary: boolean;
      linkId: string;
    }> = [];

    for (const link of links) {
      const student = await ctx.db.get(link.studentId);
      if (student) {
        results.push({
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          admNo: student.admNo,
          isPrimary: link.isPrimary,
          linkId: link._id,
        });
      }
    }
    return results;
  },
});

/** Create guardian */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    phone2: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    relationship: v.string(),
    communicationPreference: v.optional(
      v.union(
        v.literal("sms"),
        v.literal("call"),
        v.literal("email"),
        v.literal("app"),
      )
    ),
    preferredLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("guardians", args);
    await logAuditEntry(ctx, args.schoolId, "guardian.create", { guardianId: id });
    return id;
  },
});

/** Update guardian */
export const update = mutation({
  args: {
    id: v.id("guardians"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    phone2: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    idNumber: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    relationship: v.optional(v.string()),
    communicationPreference: v.optional(
      v.union(
        v.literal("sms"),
        v.literal("call"),
        v.literal("email"),
        v.literal("app"),
      )
    ),
    preferredLanguage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const guardian = await ctx.db.get(id);
    if (!guardian) throw new Error("Guardian not found");

    const patched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patched[key] = value;
    }
    await ctx.db.patch(id, patched);
    await logAuditEntry(ctx, guardian.schoolId, "guardian.update", { guardianId: id });
    return id;
  },
});

/** Remove guardian */
export const remove = mutation({
  args: { id: v.id("guardians") },
  handler: async (ctx, args) => {
    const guardian = await ctx.db.get(args.id);
    if (!guardian) throw new Error("Guardian not found");

    // Remove all links first
    const links = await ctx.db
      .query("guardian_links")
      .withIndex("by_guardianId", (q) => q.eq("guardianId", args.id))
      .take(20);
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, guardian.schoolId, "guardian.remove", { guardianId: args.id });
  },
});

/** Get stats */
export const getStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const guardians = await ctx.db
      .query("guardians")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);

    const links = await ctx.db
      .query("guardian_links")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(1000);

    // Count unique students with guardians
    const studentsWithGuardians = new Set(links.map((l) => l.studentId));

    return {
      totalGuardians: guardians.length,
      totalLinks: links.length,
      studentsWithGuardians: studentsWithGuardians.size,
    };
  },
});
