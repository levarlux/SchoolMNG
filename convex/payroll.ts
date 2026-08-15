import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { type Id } from "./_generated/dataModel";
import { requireModuleEditAccessByName, logAuditEntry } from "./helpers";

/**
 * Payroll — monthly staff salaries.
 *
 * Salaries are stored per staff member in a `feature_configurations` row
 * (`featureName: "payroll_salaries"`, config.salaries: { staffId → amount }),
 * reusing an existing table so no schema migration is required.
 *
 * "Run payroll" posts one `expenditures` row per salaried staff member
 * (category "Salaries"), so payroll lands in the Expenditures module where it
 * can be budgeted and audited like any other spend.
 */

const SALARY_CONFIG = "payroll_salaries";

async function loadSalaryConfig(ctx: QueryCtx, schoolId: Id<"schools">): Promise<Record<string, number>> {
  const cfg = await ctx.db
    .query("feature_configurations")
    .withIndex("by_feature", (q) => q.eq("schoolId", schoolId).eq("featureName", SALARY_CONFIG))
    .first();
  return (cfg?.config as { salaries?: Record<string, number> } | undefined)?.salaries ?? {};
}

export const getPayroll = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, { schoolId }) => {
    await requireModuleEditAccessByName(ctx, schoolId, "HR & Performance");
    const [staff, salaries] = await Promise.all([
      ctx.db
        .query("teachers")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .order("asc")
        .take(500),
      loadSalaryConfig(ctx, schoolId),
    ]);

    const rows = staff.map((t) => ({
      staffId: t._id,
      firstName: t.firstName,
      lastName: t.lastName,
      staffNo: t.staffNo,
      department: t.department ?? "",
      category: t.category ?? "teaching",
      email: t.email ?? null,
      phone: t.phone ?? null,
      salary: salaries[t._id] ?? 0,
    }));

    const teaching = rows.filter((r) => r.category !== "non_teaching").length;
    const nonTeaching = rows.length - teaching;

    return {
      rows,
      totalMonthly: rows.reduce((sum, r) => sum + r.salary, 0),
      staffCount: rows.length,
      teachingCount: teaching,
      nonTeachingCount: nonTeaching,
    };
  },
});

export const setSalary = mutation({
  args: {
    schoolId: v.id("schools"),
    staffId: v.id("teachers"),
    salary: v.number(),
  },
  handler: async (ctx, { schoolId, staffId, salary }) => {
    await requireModuleEditAccessByName(ctx, schoolId, "HR & Performance");
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.schoolId !== schoolId) throw new Error("Staff member not found");
    if (salary < 0) throw new Error("Salary cannot be negative");

    const cfg = await ctx.db
      .query("feature_configurations")
      .withIndex("by_feature", (q) => q.eq("schoolId", schoolId).eq("featureName", SALARY_CONFIG))
      .first();
    const salaries = { ...(cfg?.config as { salaries?: Record<string, number> } | undefined)?.salaries ?? {} };
    if (salary === 0) {
      delete salaries[staffId];
    } else {
      salaries[staffId] = salary;
    }

    if (cfg) {
      await ctx.db.patch(cfg._id, { config: { salaries } });
    } else {
      await ctx.db.insert("feature_configurations", {
        schoolId,
        featureName: SALARY_CONFIG,
        isEnabled: true,
        config: { salaries },
      });
    }
    await logAuditEntry(ctx, schoolId, "payroll.salary.set", { staffId, salary });
  },
});

export const runPayroll = mutation({
  args: {
    schoolId: v.id("schools"),
    monthLabel: v.string(),
  },
  handler: async (ctx, { schoolId, monthLabel }) => {
    await requireModuleEditAccessByName(ctx, schoolId, "HR & Performance");
    const identity = await ctx.auth.getUserIdentity();
    const [staff, salaries] = await Promise.all([
      ctx.db
        .query("teachers")
        .withIndex("by_schoolId", (q) => q.eq("schoolId", schoolId))
        .take(500),
      loadSalaryConfig(ctx, schoolId),
    ]);

    const date = Date.now();
    let total = 0;
    let count = 0;
    for (const t of staff) {
      const salary = salaries[t._id] ?? 0;
      if (salary <= 0) continue;
      await ctx.db.insert("expenditures", {
        schoolId,
        category: "Salaries",
        description: `Salary for ${t.firstName} ${t.lastName} (${t.staffNo}) — ${monthLabel}`,
        amount: salary,
        date,
        paidTo: `${t.firstName} ${t.lastName}`,
        paymentMethod: "bank_transfer",
        reference: monthLabel,
        approvedBy: identity?.subject ?? "system",
      });
      total += salary;
      count++;
    }

    await logAuditEntry(ctx, schoolId, "payroll.run", { monthLabel, count, total });
    return { count, total };
  },
});
