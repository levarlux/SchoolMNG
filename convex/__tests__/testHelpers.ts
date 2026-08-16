import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** List all schools — no auth gate (test helper). */
export const listSchools = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("schools").take(500);
  },
});

/** List modules by school — no auth gate (test helper). */
export const listModules = internalQuery({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    return await ctx.db
      .query("modules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
      .take(100);
  },
});

/** List sections by module — no auth gate (test helper). */
export const listSections = internalQuery({
  args: { moduleId: v.id("modules") },
  handler: async (ctx, { moduleId }) => {
    return await ctx.db
      .query("sections")
      .withIndex("by_moduleId", (q) => q.eq("moduleId", moduleId))
      .take(100);
  },
});

/** Create a section — no auth gate (test helper). */
export const createSection = internalMutation({
  args: {
    schoolId: v.id("schools"),
    moduleId: v.id("modules"),
    name: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sections", {
      schoolId: args.schoolId,
      moduleId: args.moduleId,
      name: args.name,
      description: "Test section",
      order: args.order,
      isEnabled: true,
      isSystem: false,
    });
  },
});

/** Update a section — no auth gate (test helper). */
export const updateSection = internalMutation({
  args: {
    id: v.id("sections"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isEnabled: args.isEnabled });
  },
});

/** Create a field — no auth gate (test helper). */
export const createField = internalMutation({
  args: {
    schoolId: v.id("schools"),
    sectionId: v.id("sections"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("fields", {
      schoolId: args.schoolId,
      sectionId: args.sectionId,
      name: args.name,
      inputType: "text_short",
      options: [],
      isRequired: false,
      isCustom: true,
      isSystem: false,
      aliases: [],
      order: 1,
    });
  },
});

/** Remove a field — no auth gate (test helper). */
export const removeField = internalMutation({
  args: { id: v.id("fields") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

/** Simplified nav routing check — mirrors nav.ts logic without auth. */
export const checkNavRoute = internalQuery({
  args: { schoolId: v.id("schools"), moduleId: v.id("modules") },
  handler: async (ctx, { schoolId, moduleId }) => {
    // Mirror MODULE_HREF from nav.ts
    const MODULE_HREF: Record<string, string | null> = {
      "Student Record": "/dashboard/students",
      Academics: "/dashboard/classes",
      Attendance: "/dashboard/attendance",
      Library: "/dashboard/books",
      Finance: "/dashboard/fees",
      Boarding: "/dashboard/students",
      Feeding: "/dashboard/students",
      Payroll: "/dashboard/payroll",
      Discipline: "/dashboard/discipline",
    };

    const mod = await ctx.db.get(moduleId);
    if (!mod) return { error: "Module not found" };

    // Check if module has enabled sections
    const sections = await ctx.db
      .query("sections")
      .withIndex("by_moduleId", (q) => q.eq("moduleId", moduleId))
      .collect();
    const enabledSections = sections.filter((s) => s.isEnabled);
    const hasEavSections = enabledSections.length > 0;

    // Mirror nav.ts routing logic
    const href = hasEavSections
      ? `/dashboard/records?moduleId=${moduleId}`
      : (MODULE_HREF[mod.name] ?? `/dashboard/records?moduleId=${moduleId}`);

    return {
      moduleId,
      moduleName: mod.name,
      hasEavSections,
      sectionCount: enabledSections.length,
      totalSections: sections.length,
      href,
      isEavRoute: href.includes("/dashboard/records?moduleId="),
    };
  },
});

/** Remove a section — no auth gate (test helper). */
export const removeSection = internalMutation({
  args: { id: v.id("sections") },
  handler: async (ctx, { id }) => {
    // Also remove any fields in this section
    const fields = await ctx.db
      .query("fields")
      .withIndex("by_sectionId", (q) => q.eq("sectionId", id))
      .collect();
    for (const f of fields) await ctx.db.delete(f._id);
    await ctx.db.delete(id);
  },
});
