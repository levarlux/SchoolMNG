import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership, requireStudentMembership, requireModuleAccessByName, logAuditEntry } from "./helpers";

export const listByStudent = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const student = await requireStudentMembership(ctx, args.studentId);
    await requireModuleAccessByName(ctx, student.schoolId, "Documents");
    return await ctx.db
      .query("student_documents")
      .withIndex("by_studentId", (q) => q.eq("studentId", args.studentId))
      .order("desc")
      .take(100);
  },
});

export const listBySchool = query({
  args: { schoolId: v.id("schools") },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    return await ctx.db
      .query("student_documents")
      .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
      .order("desc")
      .take(500);
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    studentId: v.id("students"),
    name: v.string(),
    category: v.string(),
    fileStorageId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireSchoolMembership(ctx, args.schoolId);
    const identity = await ctx.auth.getUserIdentity();
    const id = await ctx.db.insert("student_documents", {
      schoolId: args.schoolId,
      studentId: args.studentId,
      name: args.name,
      category: args.category,
      fileStorageId: args.fileStorageId,
      uploadedBy: identity?.subject ?? "system",
      uploadedAt: Date.now(),
    });
    await logAuditEntry(ctx, args.schoolId, "studentDocument.create", {
      documentId: id,
      studentId: args.studentId,
      name: args.name,
    });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("student_documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Document not found");
    await requireSchoolMembership(ctx, doc.schoolId);
    await ctx.db.delete(args.id);
    await logAuditEntry(ctx, doc.schoolId, "studentDocument.remove", {
      documentId: args.id,
    });
  },
});
