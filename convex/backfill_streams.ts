import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * One-time migration: backfill schoolId on existing streams.
 * Run from the Convex dashboard:
 *   npx convex run backfill_streams:backfillStreamSchoolIds
 */
export const backfillStreamSchoolIds = internalAction({
  args: {},
  handler: async (ctx: any): Promise<{ total: number; patched: number; skipped: number }> => {
    let patched = 0;
    let skipped = 0;

    const streams: { id: any; classId: any }[] = await (ctx as any).runQuery(internal.backfill_streams_helpers.getStreamsNeedingBackfill);
    for (const { id, classId } of streams) {
      const schoolId: string | null = await (ctx as any).runQuery(internal.backfill_streams_helpers.getClassSchoolId, { classId });
      if (!schoolId) {
        skipped++;
        continue;
      }
      await (ctx as any).runMutation(internal.backfill_streams_helpers.patchStreamSchoolId, { streamId: id, schoolId });
      patched++;
    }

    return { total: streams.length, patched, skipped };
  },
});
