import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requirePrincipal, logAuditEntry, isLeadershipRoleKey } from "./helpers";
import { Doc, Id } from "./_generated/dataModel";

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

/** Internal-only: is the given role key this school's leadership role (per-school, P0#4)? */
export const isLeadershipByKey = internalQuery({
  args: { schoolId: v.id("schools"), key: v.string() },
  handler: async (ctx, { schoolId, key }) => {
    // Fast path: the default leadership key needs no extra read.
    if (key === LEADERSHIP_ROLE_KEY) return true;
    const role = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", key)
      )
      .first();
    return role?.isLeadership === true;
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
        const row: {
          schoolId: Id<"schools">;
          key: string;
          name: string;
          description?: string;
          baseBucket: string;
          isDefault: boolean;
          isLeadership?: boolean;
        } = {
          schoolId: args.schoolId,
          key: role.key,
          name: role.name,
          description: role.description,
          baseBucket: role.baseBucket,
          isDefault: true,
        };
        // The principal archetype is the school's leadership role. Storing
        // this per-school (P0#4) lets a school later promote a different
        // role to leadership without any hardcoded key.
        if (role.key === LEADERSHIP_ROLE_KEY) row.isLeadership = true;
        await ctx.db.insert("roles", row);
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
/**
 * Per-school leadership role (P0#4): promote any role in this school to
 * leadership. The promoted role gets `isLeadership: true` and all others are
 * cleared, so leadership is fully configurable per school — auth gates
 * resolve it through the flag rather than a hardcoded key.
 */
export const setLeadershipRole = mutation({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
  },
  handler: async (ctx, { schoolId, roleId }) => {
    await requirePrincipal(ctx, schoolId);

    const target = await ctx.db.get(roleId);
    if (!target) throw new Error("Role not found");
    if (target.schoolId !== schoolId) {
      throw new Error("Role does not belong to this school");
    }

    // Clear the flag on every role, then set it on the target.
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);
    for (const r of roles) {
      if (r.isLeadership === true) {
        await ctx.db.patch(r._id, { isLeadership: false });
      }
    }
    await ctx.db.patch(target._id, { isLeadership: true });

    await logAuditEntry(ctx, schoolId, "role.setLeadershipRole", {
      roleId,
      name: target.name,
    });
    return target;
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

    // Update the leadership role's display name (per-school resolved).
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);
    const leadership =
      roles.find((r) => r.isLeadership === true) ??
      roles.find((r) => r.key === LEADERSHIP_ROLE_KEY);
    if (leadership) {
      await ctx.db.patch(leadership._id, { name: trimmed });
    }

    // Cache override on the school row.
    await ctx.db.patch(schoolId, { leadershipTitle: trimmed });
    await logAuditEntry(ctx, schoolId, "role.setLeadershipTitle", { title: trimmed });
    return trimmed;
  },
});
