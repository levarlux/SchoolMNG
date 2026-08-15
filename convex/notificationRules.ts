import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** List rules by school */
export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notification_rules")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(100);
  },
});

/** Get single rule */
export const get = query({
  args: { id: v.id("notification_rules") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/** Create a rule */
export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    triggerType: v.string(),
    moduleRef: v.string(),
    condition: v.string(),
    recipientRoles: v.array(v.string()),
    deliveryChannels: v.array(v.string()),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notification_rules", args);
  },
});

/** Update a rule */
export const update = mutation({
  args: {
    id: v.id("notification_rules"),
    triggerType: v.optional(v.string()),
    moduleRef: v.optional(v.string()),
    condition: v.optional(v.string()),
    recipientRoles: v.optional(v.array(v.string())),
    deliveryChannels: v.optional(v.array(v.string())),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Rule not found");

    const patched: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patched[key] = value;
    }
    await ctx.db.patch(id, patched);
    return id;
  },
});

/** Toggle rule enabled/disabled */
export const toggle = mutation({
  args: { id: v.id("notification_rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Rule not found");
    await ctx.db.patch(args.id, { isEnabled: !rule.isEnabled });
  },
});

/** Remove a rule */
export const remove = mutation({
  args: { id: v.id("notification_rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Rule not found");
    await ctx.db.delete(args.id);
  },
});

/** Seed default rules for a school */
export const seedDefaults = mutation({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    const defaults = [
      {
        triggerType: "fee_overdue",
        moduleRef: "fees",
        condition: "Balance > 0 past due date",
        recipientRoles: ["guardian", "bursar"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "book_overdue",
        moduleRef: "library",
        condition: "Borrowing past due date",
        recipientRoles: ["guardian", "librarian"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "leave_request",
        moduleRef: "hr",
        condition: "New leave request submitted",
        recipientRoles: ["principal"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "leave_approved",
        moduleRef: "hr",
        condition: "Leave request approved or denied",
        recipientRoles: ["teacher"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "discipline_case",
        moduleRef: "discipline",
        condition: "New discipline incident reported",
        recipientRoles: ["class_teacher", "principal"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "low_inventory",
        moduleRef: "medical",
        condition: "Medical supply below minimum stock",
        recipientRoles: ["nurse", "principal"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "new_admission",
        moduleRef: "admissions",
        condition: "New admission application received",
        recipientRoles: ["principal"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
      {
        triggerType: "appraisal_due",
        moduleRef: "hr",
        condition: "Staff appraisal review date approaching",
        recipientRoles: ["principal"],
        deliveryChannels: ["in_app"],
        isEnabled: true,
      },
    ];

    const created: string[] = [];
    for (const rule of defaults) {
      // Skip if already exists
      const existing = await ctx.db
        .query("notification_rules")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
        .take(100);
      const alreadyExists = existing.some((e) => e.triggerType === rule.triggerType);
      if (!alreadyExists) {
        const id = await ctx.db.insert("notification_rules", {
          schoolId: args.schoolId,
          ...rule,
        });
        created.push(id);
      }
    }
    return created;
  },
});
