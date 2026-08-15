import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

/** Default role archetypes seeded per school on creation. */
export const DEFAULT_ROLES = [
  {
    key: "principal" as const,
    name: "Principal",
    description: "Full access to all modules and data across the school",
    baseBucket: "leadership",
  },
  {
    key: "teacher" as const,
    name: "Teacher",
    description: "Access to assigned classes, students, and teaching modules",
    baseBucket: "teaching_staff",
  },
  {
    key: "librarian" as const,
    name: "Librarian",
    description: "Access to library module and student lookup for borrowing",
    baseBucket: "non_teaching_staff",
  },
  {
    key: "bursar" as const,
    name: "Bursar",
    description: "Access to finance module, fees, and expenditure",
    baseBucket: "admin_staff",
  },
  {
    key: "nurse" as const,
    name: "Nurse",
    description: "Access to health module and student health records",
    baseBucket: "non_teaching_staff",
  },
] as const;

/** Stable key for the school's top leadership role. */
export const LEADERSHIP_ROLE_KEY = "principal";

/** Internal-only: get a role by its stable key within a school. */
export const getByKey = internalQuery({
  args: { schoolId: v.id("schools"), key: v.string() },
  handler: async (ctx, { schoolId, key }) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", key)
      )
      .first();
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("roles")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("asc")
      .take(100);
  },
});

export const get = query({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.id);
    if (!role) throw new Error("Role not found");
    return role;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    description: v.optional(v.string()),
    baseBucket: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const id = await ctx.db.insert("roles", {
      schoolId: args.schoolId,
      key: `custom:${Date.now()}:${args.name.toLowerCase().replace(/\s+/g, "_")}`,
      name: args.name,
      description: args.description,
      baseBucket: args.baseBucket,
      isDefault: false,
    });
    await logAuditEntry(ctx, args.schoolId, "role.create", {
      roleId: id,
      name: args.name,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    baseBucket: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.id);
    if (!role) throw new Error("Role not found");
    await requireSchoolMembership(ctx, role.schoolId);
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.name !== undefined) updates.name = fields.name;
    if (fields.description !== undefined) updates.description = fields.description;
    if (fields.baseBucket !== undefined) updates.baseBucket = fields.baseBucket;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(id, updates);
    }
    await logAuditEntry(ctx, role.schoolId, "role.update", {
      roleId: id,
      updates,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("roles") },
  handler: async (ctx, args) => {
    const role = await ctx.db.get(args.id);
     if (!role) throw new Error("Role not found");
    // System roles (the seeded leadership/teacher/etc. keys) cannot be deleted,
    // but their display NAME is fully editable so schools can rename "Principal"
    // to "Headteacher" etc.
    if (role.key === LEADERSHIP_ROLE_KEY || role.key === "teacher") {
      throw new Error("Cannot delete core system roles");
    }
    if (role.isDefault) throw new Error("Cannot delete default roles");
    await requireSchoolMembership(ctx, role.schoolId);

    // Remove associated permissions
    const perms = await ctx.db
      .query("permissions")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.id))
      .take(200);
    for (const p of perms) {
      await ctx.db.delete(p._id);
    }

    // Remove associated scope rules
    const scopes = await ctx.db
      .query("scopeRules")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.id))
      .take(100);
    for (const s of scopes) {
      await ctx.db.delete(s._id);
    }

    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, role.schoolId, "role.remove", {
      roleId: args.id,
      name: role.name,
    });
  },
});

/**
 * Seed default roles for a school. Called once during onboarding.
 * Idempotent — skips if a role with the same name already exists.
 */
export const seedDefaults = internalMutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    const existing = await ctx.db
      .query("roles")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(50);
    const existingKeys = new Set(existing.map((r) => r.key));

    let created = 0;
    for (const role of DEFAULT_ROLES) {
      if (!existingKeys.has(role.key)) {
        await ctx.db.insert("roles", {
          schoolId: args.schoolId,
          key: role.key,
          name: role.name,
          description: role.description,
          baseBucket: role.baseBucket,
          isDefault: true,
        });
        created++;
      }
    }

    await logAuditEntry(ctx, args.schoolId, "role.seedDefaults", {
      created,
    });
    return created;
  },
});

/**
 * Set the school-wide leadership display title (e.g. "Headteacher", "Director").
 * Updates both the `roles` table display name for the leadership key AND
 * `schools.leadershipTitle` for a fast lookup override.
 */
export const setLeadershipTitle = mutation({
  args: {
    schoolId: v.id("schools"),
    title: v.string(),
  },
  handler: async (ctx, { schoolId, title }) => {
    await requireSchoolMembership(ctx, schoolId);
    const trimmed = title.trim() || "Principal";

    // Update the roles table display name.
    const leadership = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", LEADERSHIP_ROLE_KEY)
      )
      .first();
    if (leadership) {
      await ctx.db.patch(leadership._id, { name: trimmed });
    }

    // Cache override on the school row.
    await ctx.db.patch(schoolId, { leadershipTitle: trimmed });
    await logAuditEntry(ctx, schoolId, "role.setLeadershipTitle", { title: trimmed });
    return trimmed;
  },
});
