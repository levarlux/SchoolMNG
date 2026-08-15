"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatAssistantText } from "@/components/ai-chat";
import {
  Shield, Bot, Send, Sparkles, Users, Check, X, Trash2,
  Mail, UserPlus, Settings, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, Eye, Edit3, Ban, RefreshCw,
  Clock, ShieldCheck, ShieldOff, Search, MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: PendingAction[];
}

interface PendingAction {
  type: "set_permission" | "invite_user" | "create_role" | "suspend_member" | "revoke_member";
  label: string;
  params: Record<string, any>;
  executed?: boolean;
  result?: string;
}

// ── Suggested prompts ──────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "Show me all current roles and their permissions",
  "Create a new role called Librarian with access to the Library module",
  "Give the Teacher role view access to Health module",
  "Invite john@example.com as a Bursar",
  "What permissions does the Nurse role have?",
  "Suspend the account for john@example.com",
];

// ── Main Component ─────────────────────────────────────────────────

export default function PermissionsPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);

  // ── Chat state ──
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Right panel state ──
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Data queries ──
  const roles = useQuery(api.roles.listBySchool, school ? { schoolId: school._id } : "skip");
  const members = useQuery(api.members.listBySchool, school ? { schoolId: school._id } : "skip");
  const modules = useQuery(api.modules.listBySchool, school ? { schoolId: school._id } : "skip");
  const permissions = useQuery(api.permissions.listBySchool, school ? { schoolId: school._id } : "skip");
  const sections = useQuery(api.sections.listBySchool, school ? { schoolId: school._id } : "skip");
  const invitations = useQuery(
    api.invitations.listInvitations,
    school ? { schoolId: school._id } : "skip"
  );

  // ── Mutations ──
  const createRole = useMutation(api.roles.create);
  const updateRole = useMutation(api.roles.update);
  const removeRole = useMutation(api.roles.remove);
  const setPermission = useMutation(api.permissions.set);
  const removePermission = useMutation(api.permissions.remove);
  const setMemberStatus = useMutation(api.members.setMemberStatus);
  const revokeMember = useAction(api.members.revokeMember);
  const sendInvitation = useAction(api.invitations.sendInvitation);
  const revokeInvitation = useAction(api.invitations.revokeInvitation);
  const resendInvitation = useAction(api.invitations.resendInvitation);
  const chatAction = useAction(api.permissionAgent.chat);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Welcome message ──
  useEffect(() => {
    if (messages.length === 0 && school) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: `Hello! I'm your **Permissions Assistant** for **${school.name}**.\n\nI can help you:\n• Create new roles (e.g., Librarian, Bursar, Nurse)\n• Assign view/edit permissions to modules\n• Invite staff members with specific roles\n• Suspend or revoke access\n• Show current role assignments\n\nJust tell me what you need in plain language!`,
        timestamp: new Date(),
      }]);
    }
  }, [school?.name]);

  // ── Build context for the agent ──
  const buildSchoolContext = useCallback((): string => {
    const lines: string[] = [];
    lines.push(`School: ${school?.name}`);

    if (roles && roles.length > 0) {
      lines.push(`\nRoles (${roles.length}):`);
      for (const r of roles) {
        const perms = permissions?.filter((p) => p.roleId === r._id) ?? [];
        const permStr = perms.length > 0
          ? perms.map((p) => `${p.nodeType}:${p.nodeId}=${p.access}`).join(", ")
          : "no explicit permissions";
        lines.push(`  - ${r.name} (key: ${r.key}, bucket: ${r.baseBucket}): ${permStr}`);
      }
    }

    if (members && members.length > 0) {
      lines.push(`\nMembers (${members.length}):`);
      for (const m of members) {
        lines.push(`  - ${m.name ?? m.email ?? "unknown"} (${m.email}) — role: ${m.role}, status: ${m.status ?? "active"}`);
      }
    }

    if (modules && modules.length > 0) {
      lines.push(`\nModules (${modules.length}):`);
      for (const m of modules) {
        lines.push(`  - ${m.name} (bucket: ${m.bucket}, enabled: ${m.isEnabled})`);
      }
    }

    if (invitations && invitations.length > 0) {
      const pending = invitations.filter((i) => i.status === "pending");
      lines.push(`\nPending invitations (${pending.length}):`);
      for (const i of pending) {
        lines.push(`  - ${i.email} → ${i.roleName} (invited ${new Date(i.createdAt).toLocaleDateString()})`);
      }
    }

    return lines.join("\n");
  }, [school, roles, members, modules, permissions, invitations]);

  // ── Parse action blocks from agent response ──
  const parseActionsFromResponse = useCallback((response: string): PendingAction[] => {
    const actions: PendingAction[] = [];

    // Try JSON code block first
    const fenceMatch = response.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        if (parsed?.action) {
          const action = parsed.action;
          const label = parsed.label ?? "Proposed change";
          actions.push({ type: action.type, label, params: action });
        }
      } catch { /* ignore */ }
    }

    // Also try inline [ACTION: ...] format for backward compat
    const actionRegex = /\[ACTION:\s*(\w+),?\s*params=([^\]]*)\]/g;
    let match;
    while ((match = actionRegex.exec(response)) !== null) {
      const type = match[1] as PendingAction["type"];
      const paramsStr = match[2];
      const params: Record<string, any> = {};
      const paramRegex = /([\w.]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,;]+))/g;
      let pm: RegExpExecArray | null;
      while ((pm = paramRegex.exec(paramsStr)) !== null) {
        const key = pm[1];
        const value = (pm[2] ?? pm[3] ?? pm[4] ?? "").trim();
        if (key) params[key.trim()] = value;
      }
      actions.push({ type, label: describeAction(type, params), params });
    }

    return actions;
  }, []);

  // ── Human-readable action descriptions ──
  const describeAction = (type: string, params: Record<string, any>): string => {
    switch (type) {
      case "set_permission":
        return `Grant ${params.access ?? "view"} access to ${params.moduleName ?? params.module ?? "module"} for ${params.roleKey ?? params.role ?? "role"}`;
      case "invite_user":
        return `Invite ${params.email} as ${params.roleKey ?? params.role ?? "member"}`;
      case "create_role":
        return `Create role "${params.name}" for ${params.bucket ?? "general"} staff`;
      case "suspend_member":
        return `Suspend ${params.member ?? "member"}: ${params.reason ?? "no reason given"}`;
      case "revoke_member":
        return `Revoke access for ${params.member ?? "member"}`;
      default:
        return `Execute ${type}`;
    }
  };

  // ── Send chat message ──
  const handleSend = async (text?: string) => {
    const message = text || input.trim();
    if (!message || isLoading || !school) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const context = buildSchoolContext();
      const result = await chatAction({
        message: `[PERMISSIONS MODE] You are helping manage roles and permissions for this school. Current state:\n${context}\n\nUser request: ${message}\n\nIf the user wants to perform an action, respond with your recommendation AND include a JSON action block like:\n\`\`\`json\n{"action":{"type":"action_type",...},"label":"<short human summary>"}\n\`\`\`\n\nAction types: set_permission, invite_user, create_role, suspend_member, revoke_member\n\nAlways explain what you're suggesting and ask for confirmation before the user approves.`,
        schoolId: school._id,
        history: messages.filter((m) => m.id !== "welcome").map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const actions = parseActionsFromResponse(result.response);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.response.replace(/```json[\s\S]*?```/g, "").replace(/\[ACTION:[^\]]*\]/g, "").trim(),
        timestamp: new Date(),
        actions: actions.length > 0 ? actions : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Execute an approved action ──
  const executeAction = async (msgId: string, actionIdx: number) => {
    if (!school) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((a, i) =>
            i === actionIdx ? { ...a, executed: true, result: "Executing..." } : a
          ),
        };
      })
    );

    const msg = messages.find((m) => m.id === msgId);
    const action = msg?.actions?.[actionIdx];
    if (!action) return;

    try {
      let result = "";

      switch (action.type) {
        case "set_permission": {
          const roleKey = action.params.roleKey ?? action.params.role;
          const moduleName = action.params.moduleName ?? action.params.module;
          const access = action.params.access ?? "view";

          const targetRole = roles?.find(
            (r) => r.key.toLowerCase() === roleKey?.toLowerCase() ||
                   r.name.toLowerCase() === roleKey?.toLowerCase()
          );
          const targetModule = modules?.find(
            (m) => m.name.toLowerCase() === moduleName?.toLowerCase()
          );

          if (!targetRole || !targetModule) {
            result = `Could not find role "${roleKey}" or module "${moduleName}".`;
          } else {
            await setPermission({
              schoolId: school._id,
              roleId: targetRole._id,
              nodeType: "module",
              nodeId: targetModule._id,
              access: access as "none" | "view" | "edit",
            });
            result = `Permission granted: ${targetRole.name} → ${targetModule.name} (${access})`;
          }
          break;
        }

        case "invite_user": {
          const email = action.params.email;
          const roleKey = action.params.roleKey ?? action.params.role;
          if (!email) {
            result = "No email address provided.";
          } else {
            await sendInvitation({
              schoolId: school._id,
              email,
              role: roleKey,
            });
            result = `Invitation sent to ${email} as ${roleKey}`;
          }
          break;
        }

        case "create_role": {
          const roleName = (action.params.name ?? "").trim();
          if (!roleName) {
            result = "I couldn't determine a name for the role. Please include a name.";
          } else {
            await createRole({
              schoolId: school._id,
              name: roleName,
              baseBucket: action.params.bucket ?? "general",
              description: action.params.description ?? undefined,
            });
            result = `Role "${roleName}" created successfully.`;
          }
          break;
        }

        case "suspend_member": {
          const memberIdent = action.params.member ?? action.params.email;
          const targetMember = members?.find(
            (m) => m.email?.toLowerCase() === memberIdent?.toLowerCase() ||
                   m.name?.toLowerCase().includes(memberIdent?.toLowerCase())
          );
          if (!targetMember) {
            result = `Could not find member "${memberIdent}".`;
          } else {
            await setMemberStatus({
              memberId: targetMember._id,
              status: "suspended",
              message: action.params.reason ?? "Access suspended by school head",
            });
            result = `${targetMember.name ?? targetMember.email} has been suspended.`;
          }
          break;
        }

        case "revoke_member": {
          const memberIdent = action.params.member ?? action.params.email;
          const targetMember = members?.find(
            (m) => m.email?.toLowerCase() === memberIdent?.toLowerCase() ||
                   m.name?.toLowerCase().includes(memberIdent?.toLowerCase())
          );
          if (!targetMember) {
            result = `Could not find member "${memberIdent}".`;
          } else {
            await revokeMember({ memberId: targetMember._id });
            result = `Access revoked for ${targetMember.name ?? targetMember.email}.`;
          }
          break;
        }

        default:
          result = `Action "${action.type}" is not yet implemented.`;
      }

      toast.success(result);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.actions) return m;
          return {
            ...m,
            actions: m.actions.map((a, i) =>
              i === actionIdx ? { ...a, executed: true, result } : a
            ),
          };
        })
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Action failed";
      toast.error(errorMsg);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.actions) return m;
          return {
            ...m,
            actions: m.actions.map((a, i) =>
              i === actionIdx ? { ...a, executed: true, result: `❌ ${errorMsg}` } : a
            ),
          };
        })
      );
    }
  };

  // ── Keyboard handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Get permissions for a role ──
  const getRolePermissions = (roleId: string) => {
    if (!permissions) return [];
    return permissions
      .filter((p) => p.roleId === roleId)
      .map((p) => {
        const node = p.nodeType === "module"
          ? modules?.find((m) => m._id === p.nodeId)
          : null;
        return {
          ...p,
          nodeName: node?.name ?? p.nodeId,
        };
      });
  };

  // ── Get members with a role ──
  const getMembersWithRole = (roleKey: string) => {
    if (!members) return [];
    return members.filter((m) => m.role === roleKey);
  };

  // ── Filtered members ──
  const filteredMembers = members?.filter((m) => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.role?.toLowerCase().includes(q)
    );
  });

  // ── Access denied ──
  if (!school || !isLeadership) {
    return (
      <div className="p-8 text-center">
        <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Access Restricted</p>
        <p className="text-sm text-muted-foreground mt-1">Only leadership can manage permissions.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-4 p-4">
      {/* ═══════════════════════════════════════════════════════════════
          LEFT PANEL — AI Chat
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Permissions Assistant</CardTitle>
                <CardDescription>Describe what you want to do — I&apos;ll handle the rest</CardDescription>
              </div>
            </div>
          </CardHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  )}
                >
                  <div className="whitespace-pre-wrap">
                    {msg.role === "assistant" ? formatAssistantText(msg.content) : msg.content}
                  </div>

                  {/* Action cards */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.actions.map((action, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2 p-2.5 rounded-lg border",
                            action.executed
                              ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                              : "bg-background/50 border-border"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">{action.label}</p>
                            {action.result && (
                              <p className={cn(
                                "text-xs mt-0.5",
                                action.result.startsWith("❌") ? "text-red-600" : "text-green-600"
                              )}>
                                {action.result}
                              </p>
                            )}
                          </div>
                          {!action.executed ? (
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => executeAction(msg.id, i)}
                              >
                                <Check className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setMessages((prev) =>
                                    prev.map((m) =>
                                      m.id === msg.id
                                        ? { ...m, actions: m.actions?.filter((_, j) => j !== i) }
                                        : m
                                    )
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <BrandLoader variant="dots" size="sm" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-3">
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g., Create a Librarian role with library access..."
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          RIGHT PANEL — Current State
          ═══════════════════════════════════════════════════════════════ */}
      <div className="w-96 shrink-0 space-y-3 overflow-y-auto">
        {/* ── Roles ── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Roles ({roles?.length ?? 0})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!roles ? (
              <BrandLoader variant="dots" size="sm" />
            ) : roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No roles defined</p>
            ) : (
              roles.map((r) => {
                const perms = getRolePermissions(r._id);
                const memberCount = getMembersWithRole(r.key).length;
                const isExpanded = expandedRole === r._id;
                const isEditing = editingRole === r._id;
                const isConfirmingDelete = confirmDelete === r._id;
                const isSystem = r.key === "principal" || r.key === "teacher";

                return (
                  <div key={r._id} className="border border-border rounded-lg overflow-hidden">
                    {/* Role header */}
                    <div
                      className={cn(
                        "flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 transition-colors",
                        isExpanded && "bg-muted/30"
                      )}
                      onClick={() => setExpandedRole(isExpanded ? null : r._id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        {isEditing ? (
                          <Input
                            value={editRoleName}
                            onChange={(e) => setEditRoleName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                updateRole({ id: r._id, name: editRoleName.trim() });
                                setEditingRole(null);
                                toast.success(`Role renamed to "${editRoleName.trim()}"`);
                              }
                              if (e.key === "Escape") setEditingRole(null);
                            }}
                            className="h-6 text-xs py-0"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-xs font-medium truncate">{r.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[10px]">{r.baseBucket}</Badge>
                        {memberCount > 0 && (
                          <Badge variant="outline" className="text-[10px]">{memberCount} members</Badge>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-2 pb-2 space-y-2 border-t border-border/50">
                        {/* Description */}
                        {r.description && (
                          <p className="text-[11px] text-muted-foreground pt-2">{r.description}</p>
                        )}

                        {/* Permissions list */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                            Module Access
                          </p>
                          {perms.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground italic">
                              No explicit permissions — falls back to defaults
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {perms.map((p) => (
                                <div key={p._id} className="flex items-center justify-between text-[11px]">
                                  <span className="truncate">{p.nodeName}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {p.access === "edit" ? (
                                      <Badge className="text-[9px] bg-blue-100 text-blue-700 hover:bg-blue-100">
                                        <Edit3 className="h-2.5 w-2.5 mr-0.5" /> edit
                                      </Badge>
                                    ) : p.access === "view" ? (
                                      <Badge className="text-[9px] bg-green-100 text-green-700 hover:bg-green-100">
                                        <Eye className="h-2.5 w-2.5 mr-0.5" /> view
                                      </Badge>
                                    ) : (
                                      <Badge className="text-[9px] bg-red-100 text-red-700 hover:bg-red-100">
                                        <Ban className="h-2.5 w-2.5 mr-0.5" /> none
                                      </Badge>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removePermission({ id: p._id });
                                        toast.success("Permission removed");
                                      }}
                                      className="text-muted-foreground hover:text-red-600 transition-colors"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Members with this role */}
                        {memberCount > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                              Members
                            </p>
                            <div className="space-y-1">
                              {getMembersWithRole(r.key).map((m) => (
                                <div key={m._id} className="flex items-center justify-between text-[11px]">
                                  <span className="truncate">{m.name ?? m.email}</span>
                                  <Badge
                                    variant={m.status === "suspended" ? "danger" : "secondary"}
                                    className="text-[9px]"
                                  >
                                    {m.status ?? "active"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Role actions */}
                        {!isSystem && (
                          <div className="flex items-center gap-1 pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingRole(r._id);
                                setEditRoleName(r.name);
                              }}
                            >
                              <Edit3 className="h-3 w-3 mr-1" /> Rename
                            </Button>
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  className="h-6 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRole({ id: r._id });
                                    setConfirmDelete(null);
                                    toast.success(`Role "${r.name}" deleted`);
                                  }}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] text-red-600 hover:text-red-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(r._id);
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ── Members ── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" /> Members ({members?.length ?? 0})
              </CardTitle>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
            {!members ? (
              <BrandLoader variant="dots" size="sm" />
            ) : filteredMembers?.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {memberSearch ? "No members match search" : "No members yet"}
              </p>
            ) : (
              filteredMembers?.slice(0, 15).map((m) => (
                <div key={m._id} className="flex items-center justify-between p-2 rounded-lg border border-border text-xs group">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{m.name ?? m.email ?? "Unknown"}</p>
                    <p className="text-muted-foreground truncate">{m.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="secondary" className="text-[9px]">{m.role}</Badge>
                      {m.status && m.status !== "active" && (
                        <Badge
                          variant={m.status === "suspended" ? "danger" : "outline"}
                          className="text-[9px]"
                        >
                          {m.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {m.status !== "suspended" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Suspend"
                        onClick={async () => {
                          await setMemberStatus({
                            memberId: m._id,
                            status: "suspended",
                            message: "Access suspended by school head",
                          });
                          toast.success(`${m.name ?? m.email} suspended`);
                        }}
                      >
                        <Ban className="h-3 w-3 text-orange-600" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Reactivate"
                        onClick={async () => {
                          await setMemberStatus({ memberId: m._id, status: "active" });
                          toast.success(`${m.name ?? m.email} reactivated`);
                        }}
                      >
                        <RefreshCw className="h-3 w-3 text-green-600" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      title="Revoke access"
                      onClick={async () => {
                        if (confirm(`Revoke access for ${m.name ?? m.email}? This cannot be undone.`)) {
                          await revokeMember({ memberId: m._id });
                          toast.success(`Access revoked for ${m.name ?? m.email}`);
                        }
                      }}
                    >
                      <ShieldOff className="h-3 w-3 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Invitations ── */}
        {invitations && invitations.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4" /> Invitations ({invitations.filter((i) => i.status === "pending").length} pending)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {invitations.slice(0, 8).map((inv) => (
                <div key={inv._id} className="flex items-center justify-between p-2 rounded-lg border border-border text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{inv.email}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="secondary" className="text-[9px]">{inv.roleName}</Badge>
                      <Badge
                        variant={
                          inv.status === "accepted" ? "default" :
                          inv.status === "pending" ? "outline" :
                          "danger"
                        }
                        className="text-[9px]"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                  {inv.status === "pending" && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Resend"
                        onClick={async () => {
                          await resendInvitation({ invitationId: inv._id });
                          toast.success("Invitation resent");
                        }}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Revoke"
                        onClick={async () => {
                          await revokeInvitation({ invitationId: inv._id });
                          toast.success("Invitation revoked");
                        }}
                      >
                        <X className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Modules ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> Modules ({modules?.filter((m) => m.isEnabled).length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {!modules ? (
              <BrandLoader variant="dots" size="sm" />
            ) : modules.filter((m) => m.isEnabled).length === 0 ? (
              <p className="text-xs text-muted-foreground">No modules enabled</p>
            ) : (
              modules.filter((m) => m.isEnabled).map((m) => {
                const permsOnModule = permissions?.filter((p) => p.nodeId === m._id && p.nodeType === "module") ?? [];
                const permsOnSections = permissions?.filter((p) => p.nodeType === "section") ?? [];
                const moduleSections = sections?.filter((s) => s.moduleId === m._id) ?? [];
                const sectionPermsForModule = moduleSections.filter((s) =>
                  permsOnSections.some((p) => p.nodeId === s._id)
                );
                return (
                  <details key={m._id} className="group">
                    <summary className="flex items-center justify-between p-2 rounded-lg border border-border text-xs cursor-pointer hover:bg-muted/50">
                      <div className="min-w-0">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-muted-foreground">{m.bucket}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {permsOnModule.length > 0 && (
                          <Badge variant="outline" className="text-[9px]">
                            {permsOnModule.length} module perm{permsOnModule.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {sectionPermsForModule.length > 0 && (
                          <Badge variant="secondary" className="text-[9px]">
                            {sectionPermsForModule.length} section perm{sectionPermsForModule.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </summary>
                    {moduleSections.length > 0 && (
                      <div className="ml-3 mt-1 space-y-1 border-l-2 border-muted pl-2">
                        {moduleSections.map((s) => {
                          const sectionPerm = permsOnSections.find((p) => p.nodeId === s._id);
                          return (
                            <div key={s._id} className="flex items-center justify-between py-1 px-2 rounded text-[11px]">
                              <span className="text-muted-foreground truncate">{s.name}</span>
                              {sectionPerm ? (
                                <Badge
                                  variant={sectionPerm.access === "edit" ? "default" : "outline"}
                                  className="text-[9px]"
                                >
                                  {sectionPerm.access}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-[9px]">inherit</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
