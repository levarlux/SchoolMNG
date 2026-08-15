"use node";

import { Mistral } from "@mistralai/mistralai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ConversationResponse } from "@mistralai/mistralai/models/components/conversationresponse";

/**
 * AI Assistant — one shared Mistral agent, re-used across every entry point
 * (chat widget, AI assistant page, onboarding). Governed by 16-ai-agent-charter.md.
 *
 * Session contract (charter §1), enforced server-side for EVERY call:
 *   - schoolId   — the agent is bound to exactly one school per conversation
 *   - userId     — who is asking (from the JWT, never from the client)
 *   - entryPoint — which surface invoked the agent
 *   - session    — one Mistral conversation per (school, entry point, user),
 *                  stored in `ai_sessions` so no school ever shares memory
 *   - live schema — a fresh, school-scoped context pack is built on every call
 *
 * The agent is instructed (charter §2) to only interpret, call tools, and
 * narrate results — never to compute or invent facts from memory.
 */

const LEADERSHIP_ROLE_KEY = "principal"; // stable key — matches convex/roles.ts
const DEFAULT_AGENT_ID = "ag_019fe478484b749e8b16916db2bc08f7";
const AGENT_VERSION = 0;
const MAX_INPUT_HISTORY = 20;

function getApiKey(): string | null {
  return process.env.MISTRAL_API_KEY ?? null;
}

function getAgentId(): string {
  return process.env.MISTRAL_AGENT_ID ?? DEFAULT_AGENT_ID;
}

let cachedClient: Mistral | null = null;
function getClient(): Mistral {
  if (!cachedClient) {
    cachedClient = new Mistral({ apiKey: getApiKey() ?? "missing" });
  }
  return cachedClient;
}

/** Pull the assistant's plain-text reply out of a ConversationResponse. */
function extractResponseText(resp: ConversationResponse): string {
  const parts: string[] = [];
  for (const out of resp.outputs ?? []) {
    if (out.type === "message.output") {
      if (typeof out.content === "string") {
        parts.push(out.content);
      } else if (Array.isArray(out.content)) {
        for (const chunk of out.content) {
          const text = (chunk as { text?: string })?.text;
          if (typeof text === "string") parts.push(text);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

// ── System context ─────────────────────────────────────────────────
// Charter §5 guardrails are stated directly so they are never diluted.

const GUARDRAILS = `Operating rules (must always follow):
1. Never state a number, date, name or status about a school record unless it comes from data given to you in this session or a tool you actually called in this turn.
2. Never invent fields, modules or records that are not present in the school context below.
3. Never assume a student/staff member exists — if you don't have their record, say you couldn't find them.
4. If the request is ambiguous, ask one clarifying question instead of guessing.
5. If there is no data, say so plainly — never fabricate a plausible answer.
6. Never perform arithmetic yourself: if a real calculation is needed, say which school data would answer it and that it must be computed from the records.
7. You are bound to ONE school per session — never mention or draw on any other school's data.
8. Keep replies concise, plain-language, under 200 words.`;

interface SchoolContextPack {
  school: { name: string; slug: string; status: string };
  currentTerm: { name: string; year: number; status: string | null } | null;
  modules: string[];
  moduleAccess?: Record<string, string>;
  isLeadership?: boolean;
  totals: {
    students: number;
    classes: number;
    teachers: number;
    books: number;
    activeBorrowings: number;
  };
  recentStudents: { name: string; admNo: string }[];
}

function stringifySchoolContext(ctx: SchoolContextPack): string {
  const lines: string[] = [];
  lines.push(`School: ${ctx.school.name} (${ctx.school.slug}, status: ${ctx.school.status})`);
  if (ctx.currentTerm) {
    lines.push(`Current term: ${ctx.currentTerm.name} ${ctx.currentTerm.year} (${ctx.currentTerm.status ?? "unknown"})`);
  }
  lines.push(
    `Live totals: ${ctx.totals.students} students, ${ctx.totals.classes} classes, ` +
    `${ctx.totals.teachers} teachers, ${ctx.totals.books} books, ` +
    `${ctx.totals.activeBorrowings} active borrowings`
  );
  if (ctx.modules.length > 0) {
    lines.push(`Enabled modules: ${ctx.modules.join(", ")}`);
  }
  if (ctx.recentStudents.length > 0) {
    lines.push(
      `Sample students: ${ctx.recentStudents.map((s) => `${s.name} (${s.admNo})`).join(", ")}`
    );
  }
  return lines.join("\n");
}

/** The per-call context block handed to the agent with every user turn. */
function buildContextBlock(
  ctx: SchoolContextPack,
  identity: { userId: string; role: string | null },
  opts: { entryPoint: string; moduleName?: string; onboardingAnswers?: Record<string, unknown> }
): string {
  const blocks: string[] = [];
  blocks.push(`You are the AI assistant of ${ctx.school.name}, a school on SchoolMNG.`);
  blocks.push(`This session is strictly bound to ${ctx.school.name}. Never use or reference any other school's data.`);
  blocks.push(`Session: entered from "${opts.entryPoint}"${opts.moduleName ? ` — ${opts.moduleName}` : ""}. Asking user role: ${identity.role ?? "staff"}.`);
  // P2 #16 — AI agent hard-boundary: module-level access control
  // The context pack now includes permission-filtered modules. We emit an
  // EXPLICIT hard boundary that tells the agent exactly which modules it
  // may access and which it must refuse.
  if (ctx.isLeadership) {
    blocks.push(
      "The user is the school head with FULL access to every module, record and figure in this school. " +
      "Never refuse, restrict, redact or second-guess any question about this school's data — " +
      "every request is authorized. Only guard the school boundary: never use another school's data."
    );
  } else {
    // Hard boundary: only modules in the permission-filtered list are accessible
    var allowedModules = ctx.modules.join(", ");
    var accessDetails = ctx.moduleAccess
      ? Object.entries(ctx.moduleAccess).map(function(entry) { return entry[0] + " (" + entry[1] + ")"; }).join(", ")
      : allowedModules;
    blocks.push(
      "HARD ACCESS BOUNDARY: The user may ONLY access these modules: [" + allowedModules + "]. " +
      "Module access levels: " + accessDetails + ". " +
      "NEVER answer questions about modules NOT in this list. If asked about a restricted module, " +
      "respond with: 'I cannot access that module - you do not have permission for it.' " +
      "Even if you have data about other modules in your training, you MUST treat this as a hard constraint. " +
      "This is not a suggestion - it is an authorization boundary enforced by the system."
    );
  }
  blocks.push(GUARDRAILS);

  if (opts.onboardingAnswers && Object.keys(opts.onboardingAnswers).length > 0) {
    const { enabledModules, enabledNotifications, schoolName, schoolType, isBoarding, enableParentPortal } =
      opts.onboardingAnswers as Record<string, unknown>;
    const setup: string[] = ["Current onboarding answers from this school's setup wizard:"];
    if (schoolName) setup.push(`- School name: ${schoolName}`);
    if (schoolType) setup.push(`- School type: ${schoolType}`);
    if (typeof isBoarding === "boolean") setup.push(`- Boarding school: ${isBoarding ? "yes" : "no"}`);
    if (typeof enableParentPortal === "boolean") setup.push(`- Parent portal: ${enableParentPortal ? "enabled" : "disabled"}`);
    if (enabledModules && typeof enabledModules === "object") {
      const on = Object.entries(enabledModules as Record<string, boolean>)
        .filter(([, val]) => val)
        .map(([key]) => key);
      if (on.length > 0) setup.push(`- Modules selected so far: ${on.join(", ")}`);
    }
    if (enabledNotifications && typeof enabledNotifications === "object") {
      const on = Object.entries(enabledNotifications as Record<string, boolean>)
        .filter(([, val]) => val)
        .map(([key]) => key);
      if (on.length > 0) setup.push(`- Notification rules selected so far: ${on.join(", ")}`);
    }
    blocks.push(setup.join("\n"));
  }

  blocks.push("--- Live school data ---");
  blocks.push(stringifySchoolContext(ctx));
  return blocks.join("\n\n");
}

/**
 * Verify the caller belongs to the school, resolving it server-side from
 * the JWT org — never trusting a client-supplied schoolId alone.
 * Returns the school row (or null if not found) for the caller to use.
 */
async function verifySchoolAccess(
  ctx: ActionCtxLike,
  identity: { subject: string; org_id?: string },
  schoolId: Id<"schools">
): Promise<{
  school: { clerkOrgId: string; name: string; slug: string; status?: string | null };
  orgId: string;
}> {
  const school = await ctx.runQuery(internal.schools.getById, { id: schoolId });
  if (!school) throw new Error("School not found");
  const orgId = identity.org_id;
  if (!orgId) {
    throw new Error("No active organisation — select a school first");
  }
  if (school.clerkOrgId !== orgId) {
    throw new Error("Not authorised for this school");
  }
  return { school, orgId };
}

type ActionCtxLike = {
  runQuery: (query: any, args: any) => Promise<any>;
  runMutation: (mutation: any, args: any) => Promise<any>;
};

// ── Chat with the shared agent ──────────────────────────────────────

export const chat = action({
  args: {
    message: v.string(),
    schoolId: v.id("schools"),
    entryPoint: v.optional(v.string()),
    moduleName: v.optional(v.string()),
    onboardingAnswers: v.optional(v.any()),
    history: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<{ response: string; conversationId: string | null }> => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        response:
          "AI Assistant is not configured. Please add your MISTRAL_API_KEY to the Convex deployment environment variables. Run:\n\n`npx convex env set MISTRAL_API_KEY your-mistral-api-key`",
        conversationId: null,
      };
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const entryPoint = args.entryPoint ?? "chat";
    const userId =
      (identity as unknown as { tokenIdentifier?: string }).tokenIdentifier ?? identity.subject;

    await verifySchoolAccess(ctx, identity as unknown as { subject: string; org_id?: string }, args.schoolId);

    const memberRole = await ctx.runQuery(internal.members.getRoleInternal, {
      userId: identity.subject,
      schoolId: args.schoolId,
    });
    const schoolCtx = await ctx.runQuery(internal.aiSessions.getFilteredSchoolContext, {
      schoolId: args.schoolId,
      userId: identity.subject,
    });
    const existingSession = await ctx.runQuery(internal.aiSessions.getSession, {
      schoolId: args.schoolId,
      userId,
      entryPoint,
    });

    if (!schoolCtx) throw new Error("School context unavailable");

    const client = getClient();
    const contextBlock = buildContextBlock(schoolCtx, { userId, role: memberRole }, {
      entryPoint,
      moduleName: args.moduleName,
      onboardingAnswers: args.onboardingAnswers as Record<string, unknown> | undefined,
    });

    let conversationId: string | null = existingSession?.conversationId ?? null;
    let reply: string;

    const userTurn = `${contextBlock}\n\nUser question:\n${args.message}`;

    try {
      let resp: ConversationResponse | null = null;

      if (conversationId) {
        try {
          // Continue the existing per-school conversation. Re-send the compact
          // live context so the agent re-grounds in current data every turn.
          // Note: for agent conversations the Mistral API forbids passing
          // completion_args (the agent's own config supplies them), so we send
          // only the input turn here.
          resp = await client.beta.conversations.append({
            conversationId,
            conversationAppendRequest: { inputs: [{ role: "user", content: userTurn }] },
          });
        } catch (error) {
          // The saved conversation may no longer exist (reset/clear from another
          // tab, or pruned on Mistral's side). Instead of surfacing an error to
          // the user, fall back to starting a fresh conversation.
          console.error("Conversation append failed; starting fresh:", error);
          conversationId = null;
        }
      }

      if (!resp) {
        // Fresh per-school conversation. Seed it with the context block plus
        // any prior turns the caller passes (e.g. onboarding transcript).
        const seedHistory = (args.history ?? []).slice(-MAX_INPUT_HISTORY);
        const inputs = [
          ...seedHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: userTurn },
        ];
        resp = await client.beta.conversations.start({
          agentId: getAgentId(),
          agentVersion: AGENT_VERSION,
          inputs,
        });
        conversationId = resp.conversationId;
      }

      reply = extractResponseText(resp);
    } catch (error) {
      console.error("Mistral agent error:", error);
      return {
        response:
          "I encountered an error contacting the AI assistant. Please try again in a moment.",
        conversationId,
      };
    }

    // Persist the transcript so the same session resumes next call.
    const baseHistory = args.history ?? existingSession?.history ?? [];
    const nextHistory = [
      ...baseHistory,
      { role: "user" as const, content: args.message },
      { role: "assistant" as const, content: reply },
    ];

    await ctx.runMutation(internal.aiSessions.upsertSession, {
      schoolId: args.schoolId,
      userId,
      entryPoint,
      moduleName: args.moduleName,
      conversationId: conversationId ?? undefined,
      messages: nextHistory,
    });

    return { response: reply, conversationId };
  },
});

// ── Reset a session (e.g. the chat widget's "Clear") ────────────────

export const resetConversation = action({
  args: {
    schoolId: v.id("schools"),
    entryPoint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId =
      (identity as unknown as { tokenIdentifier?: string }).tokenIdentifier ?? identity.subject;
    const entryPoint = args.entryPoint ?? "chat";

    await verifySchoolAccess(ctx, identity as unknown as { subject: string; org_id?: string }, args.schoolId);

    const oldConversationId = await ctx.runMutation(internal.aiSessions.resetSession, {
      schoolId: args.schoolId,
      userId,
      entryPoint,
    });

    if (oldConversationId) {
      try {
        await getClient().beta.conversations.delete({ conversationId: oldConversationId });
      } catch (error) {
        console.error("Failed to delete Mistral conversation:", error);
      }
    }

    return { ok: true };
  },
});

// ── Report summarisation (one-shot, structured data in) ─────────────

/** Call the Mistral chat API */
async function mistralChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  options: { model?: string; maxTokens?: number; temperature?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const {
    model = process.env.MISTRAL_SUMMARY_MODEL ?? "mistral-small-latest",
    maxTokens = 500,
    temperature = 0.5,
    jsonMode = false,
  } = options;

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Mistral API error:", response.status, error);
    throw new Error(`Mistral API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in Mistral response");
  }
  return content;
}

/** Generate a report summary from structured data */
export const generateReport = action({
  args: {
    reportType: v.string(),
    data: v.any(),
    schoolName: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        summary:
          "AI reporting is not configured. Please add your MISTRAL_API_KEY to the Convex environment.",
      };
    }

    const messages = [
      {
        role: "system",
        content: `You are a school report generator for ${args.schoolName}. Given structured data about this school only, generate a concise executive summary.
Focus on key insights, trends, and actionable recommendations.
Use bullet points for clarity. Keep it under 200 words.`,
      },
      {
        role: "user",
        content: `Generate a ${args.reportType} report summary for ${args.schoolName}.\n\nData:\n${JSON.stringify(args.data, null, 2)}`,
      },
    ];

    try {
      const summary = await mistralChat(apiKey, messages, {
        maxTokens: 400,
        temperature: 0.5,
      });
      return { summary };
    } catch (error) {
      console.error("AI report error:", error);
      return { summary: "Error generating report summary." };
    }
  },
});

// ── AI-assisted import mapping ──────────────────────────────────────
// One-shot, structured: the caller sends the file's column headers plus a
// small sample of rows, and the agent returns what kind of records the file
// holds and which of the school's canonical fields each column maps to. The
// client applies the suggestion but keeps the user in control of the final
// mapping (Map Columns step).

export const suggestImportMapping = action({
  args: {
    schoolId: v.id("schools"),
    fileName: v.string(),
    headers: v.array(v.string()),
    sampleRows: v.array(v.any()),
    fieldCatalog: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        required: v.boolean(),
        inputType: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
      })
    ),
    currentKind: v.optional(
      v.union(
        v.literal("students"),
        v.literal("staff"),
        v.literal("fees"),
        v.literal("attendance"),
        v.literal("fee-payments"),
        v.literal("subjects"),
        v.literal("classes"),
        v.literal("terms")
      )
    ),
  },
  handler: async (ctx, args): Promise<{
    kind: string;
    mapping: Record<string, string>;
    notes: string;
  }> => {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error(
        "AI Assistant is not configured. Add MISTRAL_API_KEY to the Convex environment variables."
      );
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await verifySchoolAccess(ctx, identity as unknown as { subject: string; org_id?: string }, args.schoolId);

    // Cost guard: AI calls cost money, so cap how often one user can trigger
    // them. The window also covers retry-spam from a misbehaving client.
    await ctx.runMutation(internal.rateLimit.enforce, {
      key: `ai-import-map:${args.schoolId}:${identity.subject}`,
      maxAttempts: 20,
      windowMs: 60_000,
    });

    const sampleText = args.sampleRows
      .slice(0, 5)
      .map((row) => JSON.stringify(row))
      .join("\n");
    const catalogText = args.fieldCatalog
      .map((f) => {
        let line = `- ${f.key}${f.required ? " (required)" : ""} — ${f.label}`;
        if (f.inputType) {
          line += ` [${f.inputType}`;
          if (f.options && f.options.length > 0) line += `: ${f.options.join("/")}`;
          line += "]";
        }
        return line;
      })
      .join("\n");

    const messages = [
      {
        role: "system",
        content:
          "You are the import assistant for a school management system. " +
          "You analyze spreadsheet files and map their columns to the school's canonical fields. " +
          "Decide what kind of records the file contains: students (student master list), staff, " +
          "fees (fee structures, class→amount), fee-payments (per-student payments/balances/receipts), " +
          "subjects (subject catalog), classes (class/stream list), terms (term schedule), or attendance. " +
          "A file with student names AND money columns (paid/amount/balance) but no admission/DOB/guardian " +
          "columns is fee-payments, NOT students. " +
          "Map every recognizable column to the canonical field whose meaning matches best. " +
          "Only map a column if you are confident; leave unmatched fields absent from the mapping. " +
          "The catalog keys are LITERAL — in your JSON mapping, always use the exact key string from the " +
          "catalog (the part before the '—'), never the human-readable label. " +
          "The catalog includes school-specific custom fields (keys starting with 'eav:') — map to them " +
          "when a column matches their label or options. " +
          "Return STRICT JSON only, with this shape:\n" +
          `{"kind":"students|staff|fees|fee-payments|subjects|classes|terms|attendance","mapping":{"<canonical field key>":"<exact column header>"},"notes":"<1-2 sentence plain-English explanation>"}`,
      },
      {
        role: "user",
        content:
          `File: ${args.fileName}\n\n` +
          `Column headers: ${args.headers.join(" | ")}\n\n` +
          `Sample rows:\n${sampleText || "(no sample rows)"}\n\n` +
          `Canonical fields available:\n${catalogText}`,
      },
    ];

    try {
      const raw = await mistralChat(apiKey, messages, {
        maxTokens: 700,
        temperature: 0.2,
        jsonMode: true,
      });
      const parsed = JSON.parse(raw) as {
        kind?: string;
        mapping?: Record<string, unknown>;
        notes?: string;
      };

      // Only keep mappings whose target is a real header, and only fields the
      // catalog knows about — never trust the model to invent columns. Match
      // case-insensitively so a header the model echoed slightly differently
      // still lands, and return the ORIGINAL header text so the client's
      // rawRows keys line up exactly.
      const headerLookup = new Map<string, string>();
      for (const h of args.headers) {
        const norm = h.trim().toLowerCase();
        if (norm && !headerLookup.has(norm)) headerLookup.set(norm, h);
      }
      const validFields = new Set(args.fieldCatalog.map((f) => f.key));
      const mapping: Record<string, string> = {};
      if (parsed.mapping && typeof parsed.mapping === "object") {
        for (const [key, value] of Object.entries(parsed.mapping)) {
          if (!validFields.has(key)) continue;
          const norm = String(value ?? "").trim().toLowerCase();
          const originalHeader = headerLookup.get(norm);
          if (originalHeader) mapping[key] = originalHeader;
        }
      }

      // Only importable kinds are valid. Anything else (the model rambling,
      // school-info, logs…) falls back to the caller's current kind rather
      // than silently dumping a staff list into Students.
      const IMPORTABLE_KINDS = new Set([
        "students",
        "staff",
        "fees",
        "attendance",
        "fee-payments",
        "subjects",
        "classes",
        "terms",
      ]);
      const kind =
        parsed.kind && IMPORTABLE_KINDS.has(parsed.kind)
          ? parsed.kind
          : args.currentKind && IMPORTABLE_KINDS.has(args.currentKind)
            ? args.currentKind
            : "students";

      return {
        kind,
        mapping,
        notes:
          typeof parsed.notes === "string" && parsed.notes.trim()
            ? parsed.notes.trim()
            : `Auto-mapped ${Object.keys(mapping).length} column${Object.keys(mapping).length === 1 ? "" : "s"}.`,
      };
    } catch (error) {
      console.error("AI import mapping error:", error);
      throw new Error("The AI assistant could not analyze this file. Please map the columns manually.");
    }
  },
});
