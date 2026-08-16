import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { getMemberRole, getLeadershipRoleKey } from "./helpers";

/**
 * P0#3 — I/O-optimised, fail-closed permission resolver.
 *
 * One instance per query/mutation handler. Resolves the caller's role ONCE
 * (member → roles lookups) and preloads that role's permission + scope rows
 * in a single bounded fetch, then answers node-access and bucket-scope
 * questions with memoised document reads: each node's effective access is
 * computed at most once, and every EAV document touched by a tree walk is
 * cached for the duration of the handler.
 *
 * Fail-closed default (spec §7): a member whose role has zero permission
 * rows resolves to "none" everywhere. Leadership and superadmins bypass.
 */

type Ctx = QueryCtx | MutationCtx;
export type AccessLevel = "none" | "view" | "edit";
export type NodeType = "module" | "section" | "field";
export type ScopeLevel =
  | "all"
  | "assigned_class"
  | "assigned_subject_classes"
  | "own_record"
  | "own_children_only"
  | "lookup_on_demand"
  | "none";

type EavNode = Doc<"modules"> | Doc<"sections"> | Doc<"fields">;

export class AccessResolver {
  private readonly ctx: Ctx;
  private readonly schoolId: Id<"schools">;
  private roleId: Id<"roles"> | null = null;
  private leadership = false;
  private readonly permMap = new Map<string, AccessLevel>();
  private readonly scopeMap = new Map<string, ScopeLevel>();
  private readonly docCache = new Map<string, EavNode | null>();
  private readonly resolvedCache = new Map<string, AccessLevel>();

  private constructor(ctx: Ctx, schoolId: Id<"schools">) {
    this.ctx = ctx;
    this.schoolId = schoolId;
  }

  /**
   * Resolve the caller's access context for a school. Never throws for
   * permission reasons — a member with no resolvable role defaults to the
   * fail-closed "none" state.
   *
   * I/O: identity (from JWT), member lookup, roles lookup, then at most two
   * bounded queries (permissions + scope rules) for the role.
   */
  static async create(ctx: Ctx, schoolId: Id<"schools">): Promise<AccessResolver> {
    const resolver = new AccessResolver(ctx, schoolId);
    const roleKey = await getMemberRole(ctx, schoolId);

    // Superadmins (getMemberRole returns the leadership key for them) and the
    // school's leadership role bypass the permission table entirely.
    if (!roleKey) return resolver;
    if (roleKey === getLeadershipRoleKey()) {
      resolver.leadership = true;
      return resolver;
    }

    const roleDoc = await ctx.db
      .query("roles")
      .withIndex("by_schoolId_key", (q) =>
        q.eq("schoolId", schoolId).eq("key", roleKey)
      )
      .first();
    if (!roleDoc) return resolver; // dangling key → fail closed
    resolver.roleId = roleDoc._id;

    // Forward-compatible with a per-school leadership flag (P0#4): if a
    // school promotes a custom role to leadership, honour it here.
    if (roleDoc.isLeadership) {
      resolver.leadership = true;
      return resolver;
    }

    const [perms, scopes] = await Promise.all([
      ctx.db
        .query("permissions")
        .withIndex("by_roleId", (q) => q.eq("roleId", roleDoc._id))
        .take(200),
      ctx.db
        .query("scopeRules")
        .withIndex("by_roleId", (q) => q.eq("roleId", roleDoc._id))
        .take(100),
    ]);

    for (const p of perms) {
      resolver.permMap.set(`${p.nodeType}:${p.nodeId}`, p.access);
    }
    for (const s of scopes) {
      resolver.scopeMap.set(s.bucket, s.scope);
    }
    return resolver;
  }

  get isLeadership(): boolean {
    return this.leadership;
  }

  get memberRoleId(): Id<"roles"> | null {
    return this.roleId;
  }

  /** Load and memoise a single EAV document for the duration of the handler. */
  private async getNode(
    table: "modules" | "sections" | "fields",
    id: string
  ): Promise<EavNode | null> {
    const key = `${table}:${id}`;
    if (this.docCache.has(key)) {
      return this.docCache.get(key) ?? null;
    }
    const doc = await (this.ctx.db.get(id as Id<any>) as Promise<EavNode | null>);
    this.docCache.set(key, doc);
    return doc;
  }

  /**
   * Pre-seed the doc cache with a node the caller has already loaded, so the
   * tree walk never re-fetches it. Call before `resolve` for documents the
   * handler already holds.
   */
  noteNode(doc: EavNode): void {
    this.docCache.set(doc._id, doc);
  }

  /**
   * Effective access for a node. Leadership bypasses to "edit"; otherwise the
   * direct permission wins (including an explicit "none", which blocks
   * fall-through), then the tree walk field → section → module fallback, then
   * "none". Every answer is memoised per handler.
   */
  async resolve(nodeType: NodeType, nodeId: string): Promise<AccessLevel> {
    if (this.leadership) return "edit";
    const key = `${nodeType}:${nodeId}`;
    const cached = this.resolvedCache.get(key);
    if (cached) return cached;
    const level = await this.resolveImpl(nodeType, nodeId);
    this.resolvedCache.set(key, level);
    return level;
  }

  private async resolveImpl(nodeType: NodeType, nodeId: string): Promise<AccessLevel> {
    const direct = this.permMap.get(`${nodeType}:${nodeId}`);
    if (direct) return direct;

    if (nodeType === "field") {
      const field = (await this.getNode("fields", nodeId)) as Doc<"fields"> | null;
      if (field && field.sectionId) {
        const sectionId = field.sectionId as string;
        const sectionAccess = await this.resolve("section", sectionId);
        if (sectionAccess !== "none") return sectionAccess;
        const section = (await this.getNode("sections", sectionId)) as
          | Doc<"sections">
          | null;
        if (section && section.moduleId) {
          return await this.resolve("module", section.moduleId as string);
        }
      }
    }

    if (nodeType === "section") {
      const section = (await this.getNode("sections", nodeId)) as
        | Doc<"sections">
        | null;
      if (section && section.moduleId) {
        return await this.resolve("module", section.moduleId as string);
      }
    }

    return "none";
  }

  /** Effective scope for a bucket. Leadership bypasses to "all". */
  scope(bucket: string): ScopeLevel {
    if (this.leadership) return "all";
    return this.scopeMap.get(bucket) ?? "none";
  }

  /** True when the caller may view data within a bucket. */
  canViewBucket(bucket: string): boolean {
    return this.scope(bucket) !== "none";
  }

  /** True when the caller has at least the required access on a node. */
  async can(nodeType: NodeType, nodeId: string, required: AccessLevel): Promise<boolean> {
    if (required === "edit") return (await this.resolve(nodeType, nodeId)) === "edit";
    if (required === "view") return (await this.resolve(nodeType, nodeId)) !== "none";
    return true;
  }

  /** Require `view` access on a node; throws when the caller lacks it. */
  async requireView(nodeType: NodeType, nodeId: string): Promise<void> {
    if (!(await this.can(nodeType, nodeId, "view"))) {
      throw new Error(`No view access to ${nodeType} ${nodeId}`);
    }
  }

  /** Require `edit` access on a node; throws when the caller lacks it. */
  async requireEdit(nodeType: NodeType, nodeId: string): Promise<void> {
    if (!(await this.can(nodeType, nodeId, "edit"))) {
      throw new Error(`Edit access required for ${nodeType} ${nodeId}`);
    }
  }

  /** Require a non-"none" scope for a bucket; throws otherwise. */
  requireBucketScope(bucket: string): void {
    if (!this.canViewBucket(bucket)) {
      throw new Error(`You do not have access to the ${bucket} data bucket`);
    }
  }
}

/** Convenience: build a resolver for the caller in one line. */
export async function accessFor(
  ctx: Ctx,
  schoolId: Id<"schools">
): Promise<AccessResolver> {
  return AccessResolver.create(ctx, schoolId);
}