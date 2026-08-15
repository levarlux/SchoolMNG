/**
 * Student Medical Sub-Records (Phase 3)
 * 
 * CRUD operations for repeatable medical sub-records:
 * - Allergies
 * - Chronic Conditions
 * - Current Medications
 * - Immunization Records
 * - Disability & Accessibility
 * - Dietary Restrictions
 * - Emergency Medical Context
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, requireModuleEditAccessByName, logAuditEntry } from "./helpers";

// ── Allergies ──────────────────────────────────────────────────────

export const listAllergies = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_allergies")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createAllergy = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    allergenName: v.string(),
    category: v.union(
      v.literal("food"), v.literal("medication"), v.literal("environmental"),
      v.literal("insect"), v.literal("other"),
    ),
    severity: v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"), v.literal("life-threatening")),
    reactionDescription: v.optional(v.string()),
    emergencyMedRequired: v.optional(v.boolean()),
    emergencyMedLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const instanceId = `allergy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const id = await ctx.db.insert("student_allergies", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      instanceId,
      allergenName: args.allergenName,
      category: args.category,
      severity: args.severity,
      reactionDescription: args.reactionDescription,
      emergencyMedRequired: args.emergencyMedRequired,
      emergencyMedLocation: args.emergencyMedLocation,
      notes: args.notes,
    });
    await logAuditEntry(ctx, args.schoolId, "studentAllergy.create", { allergyId: id, studentId: args.studentId });
    return id;
  },
});

export const updateAllergy = mutation({
  args: {
    id: v.id("student_allergies"),
    allergenName: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("food"), v.literal("medication"), v.literal("environmental"),
      v.literal("insect"), v.literal("other"),
    )),
    severity: v.optional(v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"), v.literal("life-threatening"))),
    reactionDescription: v.optional(v.string()),
    emergencyMedRequired: v.optional(v.boolean()),
    emergencyMedLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Allergy not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeAllergy = mutation({
  args: { id: v.id("student_allergies") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Allergy not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Chronic Conditions ─────────────────────────────────────────────

export const listConditions = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_conditions")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createCondition = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    conditionName: v.string(),
    icd10Code: v.optional(v.string()),
    diagnosisDate: v.optional(v.float64()),
    diagnosingPhysician: v.optional(v.string()),
    severity: v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe")),
    managementPlan: v.optional(v.string()),
    activityRestrictions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const instanceId = `condition_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const id = await ctx.db.insert("student_conditions", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      instanceId,
      conditionName: args.conditionName,
      icd10Code: args.icd10Code,
      diagnosisDate: args.diagnosisDate,
      diagnosingPhysician: args.diagnosingPhysician,
      severity: args.severity,
      managementPlan: args.managementPlan,
      activityRestrictions: args.activityRestrictions,
    });
    await logAuditEntry(ctx, args.schoolId, "studentCondition.create", { conditionId: id, studentId: args.studentId });
    return id;
  },
});

export const updateCondition = mutation({
  args: {
    id: v.id("student_conditions"),
    conditionName: v.optional(v.string()),
    icd10Code: v.optional(v.string()),
    severity: v.optional(v.union(v.literal("mild"), v.literal("moderate"), v.literal("severe"))),
    managementPlan: v.optional(v.string()),
    activityRestrictions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Condition not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeCondition = mutation({
  args: { id: v.id("student_conditions") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Condition not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Current Medications ────────────────────────────────────────────

export const listMedications = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_medications")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createMedication = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    medicationName: v.string(),
    dosage: v.string(),
    frequency: v.union(
      v.literal("once_daily"), v.literal("twice_daily"), v.literal("three_times_daily"),
      v.literal("as_needed"), v.literal("other"),
    ),
    route: v.union(v.literal("oral"), v.literal("topical"), v.literal("inhalation"), v.literal("injection"), v.literal("other")),
    prescribingPhysician: v.optional(v.string()),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
    reason: v.optional(v.string()),
    administeredAtSchool: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const instanceId = `med_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const id = await ctx.db.insert("student_medications", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      instanceId,
      medicationName: args.medicationName,
      dosage: args.dosage,
      frequency: args.frequency,
      route: args.route,
      prescribingPhysician: args.prescribingPhysician,
      startDate: args.startDate,
      endDate: args.endDate,
      reason: args.reason,
      administeredAtSchool: args.administeredAtSchool,
    });
    await logAuditEntry(ctx, args.schoolId, "studentMedication.create", { medicationId: id, studentId: args.studentId });
    return id;
  },
});

export const updateMedication = mutation({
  args: {
    id: v.id("student_medications"),
    medicationName: v.optional(v.string()),
    dosage: v.optional(v.string()),
    frequency: v.optional(v.union(
      v.literal("once_daily"), v.literal("twice_daily"), v.literal("three_times_daily"),
      v.literal("as_needed"), v.literal("other"),
    )),
    endDate: v.optional(v.float64()),
    reason: v.optional(v.string()),
    administeredAtSchool: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Medication not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeMedication = mutation({
  args: { id: v.id("student_medications") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Medication not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Immunization Records ───────────────────────────────────────────

export const listImmunizations = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_immunizations")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const createImmunization = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    vaccineName: v.string(),
    doseNumber: v.number(),
    dateAdministered: v.float64(),
    administeringProvider: v.optional(v.string()),
    batchLotNumber: v.optional(v.string()),
    nextDoseDueDate: v.optional(v.float64()),
    complianceStatus: v.union(v.literal("up_to_date"), v.literal("due_soon"), v.literal("overdue"), v.literal("exempt")),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const instanceId = `imm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const id = await ctx.db.insert("student_immunizations", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      instanceId,
      vaccineName: args.vaccineName,
      doseNumber: args.doseNumber,
      dateAdministered: args.dateAdministered,
      administeringProvider: args.administeringProvider,
      batchLotNumber: args.batchLotNumber,
      nextDoseDueDate: args.nextDoseDueDate,
      complianceStatus: args.complianceStatus,
    });
    await logAuditEntry(ctx, args.schoolId, "studentImmunization.create", { immunizationId: id, studentId: args.studentId });
    return id;
  },
});

export const updateImmunization = mutation({
  args: {
    id: v.id("student_immunizations"),
    complianceStatus: v.optional(v.union(v.literal("up_to_date"), v.literal("due_soon"), v.literal("overdue"), v.literal("exempt"))),
    nextDoseDueDate: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Immunization not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
    if (Object.keys(filtered).length > 0) {
      await ctx.db.patch(id, filtered);
    }
  },
});

export const removeImmunization = mutation({
  args: { id: v.id("student_immunizations") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Immunization not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Disability & Accessibility ─────────────────────────────────────

export const getDisability = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_disability")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
  },
});

export const upsertDisability = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    disabilityType: v.string(),
    accommodationsRequired: v.array(v.string()),
    assistiveDevices: v.optional(v.string()),
    mobilityNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const existing = await ctx.db
      .query("student_disability")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        disabilityType: args.disabilityType,
        accommodationsRequired: args.accommodationsRequired,
        assistiveDevices: args.assistiveDevices,
        mobilityNotes: args.mobilityNotes,
      });
      return existing._id;
    }
    return await ctx.db.insert("student_disability", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      disabilityType: args.disabilityType,
      accommodationsRequired: args.accommodationsRequired,
      assistiveDevices: args.assistiveDevices,
      mobilityNotes: args.mobilityNotes,
    });
  },
});

// ── Dietary Restrictions ───────────────────────────────────────────

export const listDietary = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_dietary")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .take(50);
  },
});

export const createDietary = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    restrictionType: v.union(
      v.literal("allergy"), v.literal("intolerance"), v.literal("religious"),
      v.literal("medical"), v.literal("preference"),
    ),
    specificRestriction: v.string(),
    nutritionistNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const id = await ctx.db.insert("student_dietary", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      restrictionType: args.restrictionType,
      specificRestriction: args.specificRestriction,
      nutritionistNotes: args.nutritionistNotes,
    });
    await logAuditEntry(ctx, args.schoolId, "studentDietary.create", { dietaryId: id, studentId: args.studentId });
    return id;
  },
});

export const removeDietary = mutation({
  args: { id: v.id("student_dietary") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Dietary record not found");
    await requireModuleEditAccessByName(ctx, record.schoolId, "Health/Welfare");
    await ctx.db.delete(args.id);
  },
});

// ── Emergency Medical Context ──────────────────────────────────────

export const getEmergencyMedical = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Health/Welfare");
    return await ctx.db
      .query("student_emergency_medical")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
  },
});

export const upsertEmergencyMedical = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    familyMedicalHistory: v.optional(v.string()),
    emergencyMedicalContact: v.optional(v.string()),
    medicalConsentOnFile: v.boolean(),
    specialDirectives: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireModuleEditAccessByName(ctx, args.schoolId, "Health/Welfare");
    const existing = await ctx.db
      .query("student_emergency_medical")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        familyMedicalHistory: args.familyMedicalHistory,
        emergencyMedicalContact: args.emergencyMedicalContact,
        medicalConsentOnFile: args.medicalConsentOnFile,
        specialDirectives: args.specialDirectives,
      });
      return existing._id;
    }
    return await ctx.db.insert("student_emergency_medical", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      familyMedicalHistory: args.familyMedicalHistory,
      emergencyMedicalContact: args.emergencyMedicalContact,
      medicalConsentOnFile: args.medicalConsentOnFile,
      specialDirectives: args.specialDirectives,
    });
  },
});
