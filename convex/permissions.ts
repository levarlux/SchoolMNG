import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, logAuditEntry } from "./helpers";

/**
 * Resolve effective access for a role on a specific node.
 * Walks the tree: field → section → module.
 * If a field has no explicit permission, falls back to section.
 * If a section has no explicit permission, falls back to module.
 * Default access is "none".
 */
async function resolveAccess(
  ctx: { db: any },
  roleId: any,
  nodeType: "module" | "section" | "field",
  nodeId: string,
): Promise<"none" | "view" | "edit"> {
  // Direct permission
  const direct = await ctx.db
    .query("permissions")
    .withIndex("by_roleId", (q: any) => q.eq("roleId", roleId))
    .filter((q: any) =>
      q.and(q.eq(q.field("nodeType"), nodeType), q.eq(q.field("nodeId"), nodeId))
    )
    .first();
  if (direct) return direct.access;

  // For fields, fall back to section → module
  if (nodeType === "field") {
    const field = await ctx.db.get(nodeId);
    if (field) {
      const sectionAccess = await resolveAccess(ctx, roleId, "section", field.sectionId);
      if (sectionAccess !== "none") return sectionAccess;

      const section = await ctx.db.get(field.sectionId);
      if (section) {
        return await resolveAccess(ctx, roleId, "module", section.moduleId);
      }
    }
  }

  // For sections, fall back to module
  if (nodeType === "section") {
    const section = await ctx.db.get(nodeId);
    if (section) {
      return await resolveAccess(ctx, roleId, "module", section.moduleId);
    }
  }

  return "none";
}

/**
 * Verify that a permission nodeId actually resolves to a real EAV node
 * belonging to this school. Rejects dangling ids so the permissions table
 * never references non-existent structure.
 */
async function assertNodeExists(
  ctx: { db: any },
  schoolId: any,
  nodeType: "module" | "section" | "field",
  nodeId: string,
): Promise<void> {
  const table = nodeType === "module" ? "modules" : nodeType === "section" ? "sections" : "fields";
  const node = await ctx.db.get(nodeId);
  if (!node) {
    throw new Error(`Cannot set permission: ${nodeType} ${nodeId} does not exist`);
  }
  if (node.schoolId !== schoolId) {
    throw new Error("Cannot set permission on a node outside this school");
  }
  if (table === "sections" || table === "fields") {
    const moduleId = node.moduleId;
    const mod = moduleId ? await ctx.db.get(moduleId) : null;
    if (mod && mod.schoolId !== schoolId) {
      throw new Error("Cannot set permission on a node outside this school");
    }
  }
}

/**
 * Public query: check if a role has access to a node.
 * This is a read-only check — use it in UI to gate rendering.
 */
export const checkAccess = query({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    nodeType: v.union(v.literal("module"), v.literal("section"), v.literal("field")),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await resolveAccess(ctx, args.roleId, args.nodeType, args.nodeId);
  },
});

/**
 * Internal query: resolve access for use inside other Convex functions.
 */
export const resolveAccessInternal = internalQuery({
  args: {
    roleId: v.id("roles"),
    nodeType: v.union(v.literal("module"), v.literal("section"), v.literal("field")),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return await resolveAccess(ctx, args.roleId, args.nodeType, args.nodeId);
  },
});

/**
 * List all permissions for a role.
 */
export const listByRole = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("permissions")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .take(200);
  },
});

/**
 * List all permissions for a school (across all roles).
 */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("permissions")
      .withIndex("by_schoolId_roleId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
  },
});

/**
 * Set (upsert) a permission for a role on a specific node.
 */
export const set = mutation({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    nodeType: v.union(v.literal("module"), v.literal("section"), v.literal("field")),
    nodeId: v.string(),
    access: v.union(v.literal("none"), v.literal("view"), v.literal("edit")),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    await assertNodeExists(ctx, args.schoolId, args.nodeType, args.nodeId);

    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
      .filter((q) =>
        q.and(
          q.eq(q.field("nodeType"), args.nodeType),
          q.eq(q.field("nodeId"), args.nodeId)
        )
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { access: args.access });
    } else {
      await ctx.db.insert("permissions", {
        schoolId: args.schoolId,
        roleId: args.roleId,
        nodeType: args.nodeType,
        nodeId: args.nodeId,
        access: args.access,
      });
    }

    await logAuditEntry(ctx, args.schoolId, "permission.set", {
      roleId: args.roleId,
      nodeType: args.nodeType,
      nodeId: args.nodeId,
      access: args.access,
    });
  },
});

/**
 * Bulk set permissions for a role. Replaces all permissions for the given node IDs.
 */
export const bulkSet = mutation({
  args: {
    schoolId: v.id("schools"),
    roleId: v.id("roles"),
    permissions: v.array(
      v.object({
        nodeType: v.union(v.literal("module"), v.literal("section"), v.literal("field")),
        nodeId: v.string(),
        access: v.union(v.literal("none"), v.literal("view"), v.literal("edit")),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);

    for (const perm of args.permissions) {
      await assertNodeExists(ctx, args.schoolId, perm.nodeType, perm.nodeId);

      const existing = await ctx.db
        .query("permissions")
        .withIndex("by_roleId", (q) => q.eq("roleId", args.roleId))
        .filter((q) =>
          q.and(
            q.eq(q.field("nodeType"), perm.nodeType),
            q.eq(q.field("nodeId"), perm.nodeId)
          )
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { access: perm.access });
      } else {
        await ctx.db.insert("permissions", {
          schoolId: args.schoolId,
          roleId: args.roleId,
          nodeType: perm.nodeType,
          nodeId: perm.nodeId,
          access: perm.access,
        });
      }
    }

    await logAuditEntry(ctx, args.schoolId, "permission.bulkSet", {
      roleId: args.roleId,
      count: args.permissions.length,
    });
  },
});

/**
 * Remove a single permission entry.
 */
export const remove = mutation({
  args: { id: v.id("permissions") },
  handler: async (ctx, args) => {
    const perm = await ctx.db.get(args.id);
    if (!perm) throw new Error("Permission not found");
    await requireSchoolMembership(ctx, perm.schoolId);
    await ctx.db.delete(args.id);
  },
});
