/**
 * Health Records Module (Updated for Phase 3)
 * 
 * CRUD operations for:
 * - Health Records (expanded with new fields)
 * - Clinic Visits (expanded with vitals)
 * - Counseling Notes (expanded with session type, risk level)
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Health Records ────────────────────────────────────────────────

export const getHealthRecord = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");
    await requireSchoolMembership(ctx, student.schoolId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health");
    return await ctx.db
      .query("health_records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
  },
});

export const upsertHealthRecord = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    bloodType: v.optional(v.string()),
    rhFactor: v.optional(v.union(v.literal("positive"), v.literal("negative"))),
    weight: v.optional(v.number()),
    height: v.optional(v.number()),
    lastPhysicalExam: v.optional(v.float64()),
    physicianName: v.optional(v.string()),
    physicianPhone: v.optional(v.string()),
    physicianClinic: v.optional(v.string()),
    insuranceProvider: v.optional(v.string()),
    policyNumber: v.optional(v.string()),
    insuranceExpiry: v.optional(v.float64()),
    nhifNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    // Backward compatibility fields
    allergies: v.optional(v.array(v.string())),
    conditions: v.optional(v.array(v.string())),
    medications: v.optional(v.array(v.string())),
    insuranceInfo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    
    // Auto-calculate BMI if weight and height provided
    let bmi: number | undefined;
    if (args.weight && args.height) {
      const heightInMeters = args.height / 100;
      bmi = Math.round((args.weight / (heightInMeters * heightInMeters)) * 10) / 10;
    }
    
    const existing = await ctx.db
      .query("health_records")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        bloodType: args.bloodType,
        rhFactor: args.rhFactor,
        weight: args.weight,
        height: args.height,
        bmi,
        lastPhysicalExam: args.lastPhysicalExam,
        physicianName: args.physicianName,
        physicianPhone: args.physicianPhone,
        physicianClinic: args.physicianClinic,
        insuranceProvider: args.insuranceProvider,
        policyNumber: args.policyNumber,
        insuranceExpiry: args.insuranceExpiry,
        nhifNumber: args.nhifNumber,
        notes: args.notes,
        emergencyContactName: args.emergencyContactName,
        emergencyContactPhone: args.emergencyContactPhone,
        allergies: args.allergies,
        conditions: args.conditions,
        medications: args.medications,
        insuranceInfo: args.insuranceInfo,
      });
      return existing._id;
    }
    
    return await ctx.db.insert("health_records", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      bloodType: args.bloodType,
      rhFactor: args.rhFactor,
      weight: args.weight,
      height: args.height,
      bmi,
      lastPhysicalExam: args.lastPhysicalExam,
      physicianName: args.physicianName,
      physicianPhone: args.physicianPhone,
      physicianClinic: args.physicianClinic,
      insuranceProvider: args.insuranceProvider,
      policyNumber: args.policyNumber,
      insuranceExpiry: args.insuranceExpiry,
      nhifNumber: args.nhifNumber,
      notes: args.notes,
      emergencyContactName: args.emergencyContactName,
      emergencyContactPhone: args.emergencyContactPhone,
      allergies: args.allergies,
      conditions: args.conditions,
      medications: args.medications,
      insuranceInfo: args.insuranceInfo,
    });
  },
});

// ── Clinic Visits ─────────────────────────────────────────────────

export const listClinicVisits = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("clinic_visits")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const listClinicVisitsBySchool = query({
  args: { schoolId: v.id("schools"), date: v.optional(v.float64()) },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    if (args.date) {
      return await ctx.db
        .query("clinic_visits")
        .withIndex("by_schoolId_date", (q) =>
          q.eq("schoolId", args.schoolId).eq("date", args.date!)
        )
        .order("desc")
        .take(200);
    }
    return await ctx.db
      .query("clinic_visits")
      .withIndex("by_schoolId_date", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(200);
  },
});

export const createClinicVisit = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    // New fields
    arrivalMethod: v.optional(v.union(v.literal("walk_in"), v.literal("sent_by_teacher"), v.literal("found_unwell"))),
    reportedSymptoms: v.optional(v.string()),
    temperature: v.optional(v.number()),
    pulse: v.optional(v.number()),
    bloodPressure: v.optional(v.string()),
    respiratoryRate: v.optional(v.number()),
    examiningStaff: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
    outcome: v.optional(v.union(v.literal("returned_to_class"), v.literal("sent_home"), v.literal("hospitalized"), v.literal("observation"))),
    // Backward compatibility fields
    reason: v.optional(v.string()),
    action: v.optional(v.string()),
    followUp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("clinic_visits", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      date: args.date,
      arrivalMethod: args.arrivalMethod,
      reportedSymptoms: args.reportedSymptoms,
      temperature: args.temperature,
      pulse: args.pulse,
      bloodPressure: args.bloodPressure,
      respiratoryRate: args.respiratoryRate,
      examiningStaff: args.examiningStaff,
      diagnosis: args.diagnosis,
      actionTaken: args.actionTaken,
      outcome: args.outcome,
      reason: args.reason,
      action: args.action,
      followUp: args.followUp,
      recordedBy: identity?.subject ?? "system",
    });
    await logAuditEntry(ctx, args.schoolId, "clinicVisit.create", {
      visitId: id,
      studentId: args.studentId,
    });
    return id;
  },
});

// ── Counseling Notes ──────────────────────────────────────────────

export const listCounselingNotes = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("counseling_notes")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createCounselingNote = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    date: v.float64(),
    notes: v.string(),
    isConfidential: v.boolean(),
    // New fields
    counselorName: v.optional(v.string()),
    sessionType: v.optional(v.union(v.literal("individual"), v.literal("group"), v.literal("crisis"), v.literal("family"))),
    presentingConcern: v.optional(v.string()),
    riskLevel: v.optional(v.union(v.literal("none"), v.literal("low"), v.literal("moderate"), v.literal("high"))),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("counseling_notes", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      date: args.date,
      notes: args.notes,
      counselorId: identity?.subject ?? "system",
      counselorName: args.counselorName,
      sessionType: args.sessionType,
      presentingConcern: args.presentingConcern,
      riskLevel: args.riskLevel,
      isConfidential: args.isConfidential,
    });
    await logAuditEntry(ctx, args.schoolId, "counselingNote.create", {
      noteId: id,
      studentId: args.studentId,
      riskLevel: args.riskLevel,
    });
    return id;
  },
});

export const removeCounselingNote = mutation({
  args: { id: v.id("counseling_notes") },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note) throw new Error("Note not found");
    await requireModuleEditAccessByName(ctx, note.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});
