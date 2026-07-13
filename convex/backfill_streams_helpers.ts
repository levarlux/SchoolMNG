import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const getStreamsNeedingBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    const streams = await ctx.db.query("streams").collect();
    return streams.filter((s) => !s.schoolId).map((s) => ({ id: s._id, classId: s.classId }));
  },
});

export const getClassSchoolId = internalQuery({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    const cls = await ctx.db.get(classId);
    return cls?.schoolId ?? null;
  },
});

export const patchStreamSchoolId = internalMutation({
  args: { streamId: v.id("streams"), schoolId: v.id("schools") },
  handler: async (ctx, { streamId, schoolId }) => {
    await ctx.db.patch(streamId, { schoolId });
  },
});
