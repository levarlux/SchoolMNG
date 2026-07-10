import { v } from "convex/values";
import { action } from "./_generated/server";
import { createClerkOrg, updateClerkOrg, deleteClerkOrg } from "./clerk";
import { api } from "./_generated/api";

async function assertSuperadmin(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  const metadata = (identity as Record<string, unknown>)["publicMetadata"] as
    | { role?: string }
    | undefined;
  if (metadata?.role !== "superadmin") throw new Error("Not authorized");
}

// Create school + create Clerk organisation.
export const create = action({
  args: {
    name: v.string(),
    slug: v.string(),
    books: v.optional(
      v.array(
        v.object({
          title: v.string(),
          author: v.string(),
          availableCopies: v.number(),
          totalCopies: v.optional(v.number()),
          isbn: v.optional(v.string()),
          subject: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, { name, slug, books }) => {
    await assertSuperadmin(ctx);
    const org = await createClerkOrg(name);
    const schoolId = await ctx.runMutation(api.schools.create, {
      clerkOrgId: org.id,
      name,
      slug,
      primaryColor: "#2563eb",
      secondaryColor: "#64748b",
    });

    let bookCount = 0;
    if (books && books.length > 0) {
      const result = await ctx.runMutation(api.books.bulkCreate, {
        schoolId,
        books,
      });
      bookCount = result.count;
    }

    return { clerkOrgId: org.id, bookCount };
  },
});

// Update school + sync name to Clerk org.
export const update = action({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await assertSuperadmin(ctx);
    const school = await ctx.runQuery(api.schools.getById, { id });
    if (!school) throw new Error("School not found");

    if (updates.name && updates.name !== school.name) {
      await updateClerkOrg(school.clerkOrgId, { name: updates.name });
    }

    await ctx.runMutation(api.schools.update, { id, ...updates });
  },
});

// Delete school + delete Clerk organisation.
export const remove = action({
  args: { id: v.id("schools") },
  handler: async (ctx, { id }) => {
    await assertSuperadmin(ctx);
    const school = await ctx.runQuery(api.schools.getById, { id });
    if (!school) throw new Error("School not found");

    await deleteClerkOrg(school.clerkOrgId);
    await ctx.runMutation(api.schools.remove, { id });
  },
});
