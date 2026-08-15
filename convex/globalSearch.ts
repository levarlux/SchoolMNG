import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireSchoolMembership } from "./helpers";

/**
 * Unified global search — searches hardcoded student fields (firstName,
 * lastName, admNo) AND custom EAV field values. Returns deduplicated
 * student results with the match source for UI highlighting.
 */
export const searchAll = query({
  args: { schoolId: v.id("schools"), query: v.string() },
  handler: async (ctx, { schoolId, query }) => {
    const q = query.trim();
    if (!q) return [];
    await requireSchoolMembership(ctx, schoolId);

    // ── 1. Search hardcoded student fields ────────────────────────
    const [byFirst, byLast, byAdmIdx] = await Promise.all([
      ctx.db
        .query("students")
        .withSearchIndex("search_firstName", (s) =>
          s.search("firstName", q).eq("schoolId", schoolId)
        )
        .take(10),
      ctx.db
        .query("students")
        .withSearchIndex("search_lastName", (s) =>
          s.search("lastName", q).eq("schoolId", schoolId)
        )
        .take(10),
      ctx.db
        .query("students")
        .withSearchIndex("search_admNo", (s) =>
          s.search("admNo", q).eq("schoolId", schoolId)
        )
        .take(10),
    ]);

    const exactAdm = await ctx.db
      .query("students")
      .withIndex("by_admNo", (r) => r.eq("schoolId", schoolId).eq("admNo", q))
      .first();

    // ── 2. Search EAV field values ────────────────────────────────
    // Find fieldValues whose value matches the query, then resolve
    // back to the parent student via records.studentId.
    const eavMatches = await ctx.db
      .query("fieldValues")
      .withSearchIndex("search_value", (s) =>
        s.search("value", q).eq("schoolId", schoolId)
      )
      .take(20);

    // Collect unique recordIds from EAV hits
    const eavRecordIds = new Set(eavMatches.map((fv) => fv.recordId));

    // Resolve records → students
    type StudentHit = { _id: string; firstName: string; lastName: string; admNo: string; photoUrl?: string; status?: string };
    const eavStudents: StudentHit[] = [];
    for (const recordId of eavRecordIds) {
      const record = await ctx.db.get(recordId);
      if (!record || !record.studentId) continue;
      const student = await ctx.db.get(record.studentId);
      if (student && "firstName" in student) {
        eavStudents.push(student as any);
      }
    }

    // ── 3. Search EAV records by displayName ──────────────────────
    // Records with a displayName matching the query that link to a student.
    const recordMatches = await ctx.db
      .query("records")
      .withSearchIndex("search_displayName", (s) =>
        s.search("displayName", q).eq("schoolId", schoolId)
      )
      .take(20);

    for (const record of recordMatches) {
      if (!record.studentId) continue;
      const student = await ctx.db.get(record.studentId);
      if (student && "firstName" in student) {
        eavStudents.push(student as any);
      }
    }

    // ── 4. Deduplicate and rank ───────────────────────────────────
    // Exact admNo match ranks first, then hardcoded hits, then EAV hits.
    type SearchResult = {
      _id: string;
      firstName: string;
      lastName: string;
      admNo: string;
      photoUrl?: string;
      status?: string;
      matchSource: "admNo_exact" | "name" | "admNo_search" | "custom_field";
    };

    const map = new Map<string, SearchResult>();

    // Exact admNo match — highest priority
    if (exactAdm) {
      map.set(exactAdm._id, {
        _id: exactAdm._id,
        firstName: exactAdm.firstName,
        lastName: exactAdm.lastName,
        admNo: exactAdm.admNo,
        photoUrl: exactAdm.photoUrl ?? undefined,
        status: exactAdm.status ?? undefined,
        matchSource: "admNo_exact",
      });
    }

    // Hardcoded field hits
    for (const s of [...byFirst, ...byLast, ...byAdmIdx]) {
      if (!s) continue;
      if (map.has(s._id)) continue;
      map.set(s._id, {
        _id: s._id,
        firstName: s.firstName,
        lastName: s.lastName,
        admNo: s.admNo,
        photoUrl: s.photoUrl ?? undefined,
        status: s.status ?? undefined,
        matchSource: s._id === exactAdm?._id ? "admNo_exact" : "name",
      });
    }

    // EAV hits — only if not already found via hardcoded fields
    for (const s of eavStudents) {
      if (!s || map.has(s._id)) continue;
      map.set(s._id, {
        _id: s._id,
        firstName: s.firstName,
        lastName: s.lastName,
        admNo: s.admNo,
        photoUrl: s.photoUrl ?? undefined,
        status: s.status ?? undefined,
        matchSource: "custom_field",
      });
    }

    return [...map.values()].slice(0, 20);
  },
});
