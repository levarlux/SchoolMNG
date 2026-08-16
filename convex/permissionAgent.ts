"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * Permissions Agent — a consent-gated assistant for role/permission management.
 *
 * The agent can SEE the school's live roles, modules, members and invitations,
 * answer questions, and PROPOSE changes. It can never mutate anything itself:
 * every proposed change is returned to the client as a structured `action`,
 * rendered as a consent card, and only executed when the head clicks "Allow".
 *
 * Proposed actions reference roles by their stable key and modules by name,
 * so the client maps them onto real IDs before executing (no ID hallucination).
 */

const SYSTEM_PROMPT = `You are the Permissions Assistant for a school on SchoolMNG.
You help the school head manage roles, access levels, and member invitations.
You are bound to ONE school per session — never reference any other school.

You see this school's live data below the marker "--- LIVE SCHOOL DATA ---". Only
use roles/modules/members that appear there. Never invent roles or modules.

Access levels are: none (no access), view (see only), edit (see and change).

Rules:
1. Keep replies under 150 words, plain language.
2. If the head asks what a role can do, list its current permission setup from the data.
3. If a request is ambiguous, ask one clarifying question.
4. If they ask you to CHANGE access or INVITE someone, first state what you will do,
   then end your reply with a JSON action block exactly in this shape:
   \`\`\`json
   {"action":{"type":"set_permission","roleKey":"<role key>","moduleName":"<exact module name>","access":"none|view|edit"},"label":"<short human summary>"}
   \`\`\`
   or
   \`\`\`json
   {"action":{"type":"invite_user","email":"<email>","roleKey":"<role key>"},"label":"<short human summary>"}
   \`\`\`
   Use the EXACT role key and EXACT module name from the live data. Only one action block per reply.
5. Never propose granting the leadership/principal role, and never propose removing the head's own access.
6. If the requested module or role does not exist in the live data, say so and suggest a valid one.
7. If you propose an action, keep the text before the JSON block short — the block is the action.`;

type AgentAction =
  | { type: "set_permission"; roleKey: string; moduleName: string; access: "none" | "view" | "edit" }
  | { type: "invite_user"; email: string; roleKey: string };

interface ParsedAction {
  action: AgentAction;
  label: string;
}

function parseActionBlock(text: string): ParsedAction | null {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1] : (text.match(/\{[^{}]*"action"[\s\S]*\}$/) ?? [null])[1];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim());
    const act = parsed?.action;
    if (!act || typeof act !== "object") return null;
    const label = typeof parsed?.label === "string" ? parsed.label : "Proposed change";

    if (act.type === "set_permission") {
      if (
        typeof act.roleKey === "string" &&
        typeof act.moduleName === "string" &&
        ["none", "view", "edit"].includes(act.access)
      ) {
        return { action: { type: "set_permission", roleKey: act.roleKey, moduleName: act.moduleName, access: act.access }, label };
      }
    }
    if (act.type === "invite_user") {
      if (typeof act.roleKey === "string" && typeof act.email === "string") {
        return { action: { type: "invite_user", email: act.email, roleKey: act.roleKey }, label };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function mistralChat(
  apiKey: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<string> {
  const model = process.env.MISTRAL_PERMISSIONS_MODEL ?? process.env.MISTRAL_SUMMARY_MODEL ?? "mistral-small-latest";
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 600,
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    console.error("Mistral API error:", response.status, error);
    throw new Error(`Mistral API error: ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("No content in Mistral response");
  return content;
}

export const chat = action({
  args: {
    message: v.string(),
    schoolId: v.id("schools"),
    history: v.optional(
      v.array(
        v.object({
          role: v.union(v.literal("user"), v.literal("assistant")),
          content: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<{ response: string; action: ParsedAction | null }> => {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      return {
        response: "The Permissions Assistant is not configured yet. Add your MISTRAL_API_KEY to the Convex environment.",
        action: null,
      };
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const isLeader = await ctx.runQuery(internal.members.isLeaderInternal, {
      userId: identity.subject,
      schoolId: args.schoolId,
    });
    if (!isLeader) {
      throw new Error("Only the school head can use the Permissions Assistant");
    }

    const [roles, modules, members, permissions] = await Promise.all([
      ctx.runQuery(api.roles.listBySchool, { schoolId: args.schoolId }) as Promise<{ key: string; name: string; baseBucket: string }[]>,
      ctx.runQuery(api.modules.listBySchool, { schoolId: args.schoolId }) as Promise<{ name: string }[]>,
      ctx.runQuery(api.members.listBySchool, { schoolId: args.schoolId }) as Promise<{ name?: string; email?: string; userId: string; role?: string }[]>,
      ctx.runQuery(api.permissions.listBySchool, { schoolId: args.schoolId }) as Promise<{ nodeType: string; nodeId: string; access: string }[]>,
    ]);

    const roleLines = roles.map((r) => `${r.key} (${r.name}) — base: ${r.baseBucket}`);
    const moduleLines = modules.map((m) => m.name);
    const permCount = permissions.length;
    const memberLines = members.map((m) => `${m.name ?? m.email ?? m.userId} — role ${m.role ?? "none"}`);
    const permissionSummary = permissions.length > 0
      ? `Current permission entries: ${permissions.length}. Example: ${permissions
          .slice(0, 12)
          .map((p) => `${p.nodeType}:${p.nodeId} → ${p.access}`)
          .join("; ")}`
      : "No explicit permission entries yet — roles fall back to default access.";

    const liveData = [
      "--- LIVE SCHOOL DATA ---",
      `Roles: ${roleLines.join(" | ") || "none"}`,
      `Modules: ${moduleLines.join(", ") || "none"}`,
      `Members (${members.length}): ${memberLines.join(" | ") || "none"}`,
      permissionSummary,
      `Total permission entries: ${permCount}`,
    ].join("\n");

    const history = args.history ?? [];
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-12).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: `${liveData}\n\n--- HEAD REQUEST ---\n${args.message}` },
    ];

    let response: string;
    try {
      response = await mistralChat(apiKey, messages);
    } catch (error) {
      console.error("Permissions agent error:", error);
      return {
        response: "I hit an error reaching the assistant. Please try again in a moment.",
        action: null,
      };
    }

    return { response, action: parseActionBlock(response) };
  },
});
