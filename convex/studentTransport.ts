/**
 * Student Transport (Phase 3)
 * 
 * CRUD operations for:
 * - Student Transport Assignments
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Transport Assignments ──────────────────────────────────────────

export const listTransportAssignments = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Transport");
    return await ctx.db
      .query("student_transport_assignments")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(50);
  },
});

export const createTransportAssignment = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    routeId: v.id("transport_routes"),
    pickupPoint: v.string(),
    dropOffPoint: v.string(),
    academicYearId: v.id("academicYears"),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Transport");
    
    // Deactivate any existing assignment for this student
    const existing = await ctx.db
      .query("student_transport_assignments")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .take(10);
    for (const assignment of existing) {
      if (assignment.isActive) {
        await ctx.db.patch(assignment._id, { isActive: false });
      }
    }
    
    const id = await ctx.db.insert("student_transport_assignments", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      routeId: args.routeId,
      pickupPoint: args.pickupPoint,
      dropOffPoint: args.dropOffPoint,
      academicYearId: args.academicYearId,
      isActive: true,
    });
    await logAuditEntry(ctx, args.schoolId, "transportAssignment.create", { assignmentId: id, studentId: args.studentId });
    return id;
  },
});

export const deactivateTransportAssignment = mutation({
  args: { id: v.id("student_transport_assignments") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Transport assignment not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Transport");
    await ctx.db.patch(args.id, { isActive: false });
  },
});

// ── Route Queries ──────────────────────────────────────────────────

export const listStudentsByRoute = query({
  args: { routeId: v.id("transport_routes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("student_transport_assignments")
      .withIndex("by_routeId", (q) => q.eq("routeId", args.routeId))
      .take(500);
  },
});

// ── School-wide Queries ────────────────────────────────────────────

export const listTransportAssignmentsBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_transport_assignments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

export const getTransportStats = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const assignments = await ctx.db
      .query("student_transport_assignments")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .take(500);
    
    const activeAssignments = assignments.filter(a => a.isActive);
    
    // Group by route
    const byRoute: Record<string, number> = {};
    for (const a of activeAssignments) {
      byRoute[a.routeId] = (byRoute[a.routeId] || 0) + 1;
    }
    
    return {
      totalAssigned: activeAssignments.length,
      byRoute,
    };
  },
});
