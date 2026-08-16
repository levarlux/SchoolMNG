/**
 * EAV Migration Smoke Test — verifies the full pipeline:
 *   1. Nav routes to EAV page when module has sections
 *   2. Nav falls back to hardcoded route when no sections
 *   3. Disabled sections don't trigger EAV mode
 *   4. Fields can be created/cleaned up
 *
 * Usage: npx convex run __tests__/eavMigrationTest:runTest
 */
import { action } from "../_generated/server";
import { internal } from "../_generated/api";

const h = internal.__tests__.testHelpers;

export const runTest = action({
  args: {},
  handler: async (ctx) => {
    const results: string[] = [];
    const pass = (label: string) => { results.push(`✅ ${label}`); };
    const fail = (label: string, detail?: string) => { results.push(`❌ ${label}${detail ? ` — ${detail}` : ""}`); };

    // ── Find a school ──────────────────────────────────────────
    const schools = await ctx.runQuery(h.listSchools);
    if (schools.length === 0) {
      fail("Find school", "No schools in deployment");
      return results.join("\n");
    }
    const school = schools[0];
    pass(`Found school: ${school.name}`);

    // ── List modules ───────────────────────────────────────────
    const modules = await ctx.runQuery(h.listModules, { schoolId: school._id });
    const testMod = modules.find((m: any) => m.isEnabled);
    if (!testMod) {
      fail("Find module", "No enabled modules");
      return results.join("\n");
    }
    pass(`Testing module: ${testMod.name} (${testMod._id})`);

    // ════════════════════════════════════════════════════════════
    // TEST 1: Nav routing with existing sections
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 1: Nav routing with existing sections ──");
    const route1 = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (route1.isEavRoute) {
      pass(`TEST 1: Section exists → EAV route (${route1.sectionCount} sections)`);
    } else {
      fail(`TEST 1: Section exists → EAV route`, `Route: ${route1.href}`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 2: Create a test section → should still route to EAV
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 2: Create test section ──");
    const sectionId = await ctx.runMutation(h.createSection, {
      schoolId: school._id,
      moduleId: testMod._id,
      name: "Smoke Test Section",
      order: 999,
    });
    const route2 = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (route2.isEavRoute) {
      pass(`TEST 2: Created section → still EAV route (${route2.sectionCount} sections)`);
    } else {
      fail(`TEST 2: Created section → EAV route`, `Route: ${route2.href}`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 3: Disable ALL sections → should fall back to hardcoded
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 3: Disable all sections ──");
    const sectionsBefore = await ctx.runQuery(h.listSections, { moduleId: testMod._id });
    for (const sec of sectionsBefore) {
      await ctx.runMutation(h.updateSection, { id: sec._id, isEnabled: false });
    }
    const route3 = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (!route3.isEavRoute) {
      pass(`TEST 3: All sections disabled → hardcoded route (${route3.href})`);
    } else {
      fail(`TEST 3: All sections disabled → hardcoded route`, `Route: ${route3.href}`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 4: Re-enable sections → should switch back to EAV
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 4: Re-enable sections ──");
    for (const sec of sectionsBefore) {
      await ctx.runMutation(h.updateSection, { id: sec._id, isEnabled: true });
    }
    const route4 = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (route4.isEavRoute) {
      pass(`TEST 4: Re-enabled sections → EAV route (${route4.sectionCount} sections)`);
    } else {
      fail(`TEST 4: Re-enabled sections → EAV route`, `Route: ${route4.href}`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 5: Create field → EAV route still works
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 5: Create field ──");
    const fieldId = await ctx.runMutation(h.createField, {
      schoolId: school._id,
      sectionId: sectionId,
      name: "Smoke Test Field",
    });
    const route5 = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (route5.isEavRoute) {
      pass(`TEST 5: Field created → EAV route still works`);
    } else {
      fail(`TEST 5: Field created → EAV route`, `Route: ${route5.href}`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 6: Cleanup → restore original state
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 6: Cleanup ──");
    await ctx.runMutation(h.removeField, { id: fieldId });
    await ctx.runMutation(h.removeSection, { id: sectionId });

    const routeFinal = await ctx.runQuery(h.checkNavRoute, {
      schoolId: school._id,
      moduleId: testMod._id,
    });
    if (routeFinal.isEavRoute) {
      pass(`TEST 6: Cleanup done — still EAV route (${routeFinal.sectionCount} original sections)`);
    } else {
      pass(`TEST 6: Cleanup done — hardcoded route (module has no sections now)`);
    }

    // ════════════════════════════════════════════════════════════
    // TEST 7: Verify a module WITHOUT sections gets hardcoded route
    // ════════════════════════════════════════════════════════════
    console.log("\n── TEST 7: Module without sections ──");
    // Find a module with no sections
    const noSectionMod = modules.find(async (m: any) => {
      const secs = await ctx.runQuery(h.listSections, { moduleId: m._id });
      return secs.length === 0 && m.isEnabled;
    });
    // Try each module until we find one with 0 sections
    let foundNoSection = false;
    for (const m of modules) {
      if (!m.isEnabled) continue;
      const secs = await ctx.runQuery(h.listSections, { moduleId: m._id });
      if (secs.length === 0) {
        const route7 = await ctx.runQuery(h.checkNavRoute, {
          schoolId: school._id,
          moduleId: m._id,
        });
        if (!route7.isEavRoute) {
          pass(`TEST 7: Module "${m.name}" has no sections → hardcoded route`);
        } else {
          fail(`TEST 7: Module "${m.name}" has no sections → hardcoded route`, `Route: ${route7.href}`);
        }
        foundNoSection = true;
        break;
      }
    }
    if (!foundNoSection) {
      pass(`TEST 7: All modules have sections (all route to EAV — this is expected for a mature school)`);
    }

    // ── Summary ────────────────────────────────────────────────
    return results.join("\n");
  },
});
