"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import {
  Users, Plus, Shield, Mail, Ban, RotateCcw, UserX, RefreshCw,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

type StatusAction = "suspend" | "revoke";
type StatusTarget = { memberId: Id<"members">; name: string };
type RoleChange = { memberId: Id<"members">; name: string };

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "danger" | "default" | "warning" | "outline" | "secondary" }> = {
  active: { label: "Active", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

const INVITE_STATUS_BADGE: Record<string, { label: string; variant: "success" | "danger" | "default" | "warning" | "outline" | "secondary" }> = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  revoked: { label: "Revoked", variant: "danger" },
  expired: { label: "Expired", variant: "secondary" },
};

export default function MembersPage() {
  const school = useSchool();
  const myRole = useRole();
  const isLeadership = isLeadershipRole(myRole);

  const members = useQuery(api.members.listBySchool, school ? { schoolId: school._id } : "skip");
  const invitations = useQuery(api.invitations.listInvitations, school ? { schoolId: school._id } : "skip");
  const roles = useQuery(api.roles.listBySchool, school ? { schoolId: school._id } : "skip");

  const sendInvitation = useAction(api.invitations.sendInvitation);
  const revokeInvitation = useAction(api.invitations.revokeInvitation);
  const resendInvitation = useAction(api.invitations.resendInvitation);
  const updateRole = useMutation(api.members.updateRole);
  const setMemberStatus = useMutation(api.members.setMemberStatus);
  const revokeMember = useAction(api.members.revokeMember);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [loading, setLoading] = useState(false);

  // Status-change modal state
  const [statusAction, setStatusAction] = useState<{ member: StatusTarget; action: StatusAction } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  // Role-change modal state
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null);
  const [roleChangeValue, setRoleChangeValue] = useState("");
  const [roleChangeMessage, setRoleChangeMessage] = useState("");

  const inviteableRoles = useMemo(() => (roles ?? []).filter((r) => r.key !== "principal"), [roles]);
  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles ?? []) m.set(r.key, r.name);
    return m;
  }, [roles]);

  if (members === undefined || !school || roles === undefined || invitations === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  // ── Invite ─────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!inviteRole) {
      toast.error("Pick a role for this person");
      return;
    }
    setLoading(true);
    try {
      const res = await sendInvitation({
        schoolId: school._id,
        email: email.trim(),
        role: inviteRole,
      });
      toast.success(`Invitation sent to ${res.email} (${res.roleName})`);
      setShowInviteModal(false);
      setEmail("");
      setInviteRole("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(invitationId: Id<"invitations">) {
    try {
      await resendInvitation({ invitationId });
      toast.success("Invitation resent — a fresh email is on its way");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend invitation");
    }
  }

  async function handleRevokeInvite(invitationId: Id<"invitations">) {
    if (!confirm("Revoke this invitation? The invitee will no longer be able to accept it.")) return;
    try {
      await revokeInvitation({ invitationId });
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke invitation");
    }
  }

  // ── Member status (suspend / reactivate / revoke) ──────────────────
  async function handleStatusSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!statusAction) return;
    const { member, action } = statusAction;
    try {
      if (action === "suspend") {
        await setMemberStatus({ memberId: member.memberId, status: "suspended", message: statusMessage.trim() || undefined });
        toast.success(`${member.name} suspended`);
      } else {
        await revokeMember({ memberId: member.memberId });
        toast.success(`${member.name} revoked — access removed`);
      }
      setStatusAction(null);
      setStatusMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function handleReactivate(memberId: Id<"members">, name: string) {
    try {
      await setMemberStatus({ memberId, status: "active", message: "Your access has been restored." });
      toast.success(`${name} reactivated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate");
    }
  }

  async function handleRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleChange) return;
    try {
      await updateRole({
        memberId: roleChange.memberId,
        role: roleChangeValue,
        message: roleChangeMessage.trim() || undefined,
      });
      toast.success(`Role updated for ${roleChange.name}`);
      setRoleChange(null);
      setRoleChangeValue("");
      setRoleChangeMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  }

  const pendingInvites = invitations.filter((i) => i.status === "pending");
  const sortedInvitations = [...invitations].sort((a, b) => b.createdAt - a.createdAt);
  const inviteRoleLabel = (key: string) => roleNameById.get(key) ?? key;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Members &amp; Roles</h1>
          <p className="text-muted-foreground mt-1">
            Invite people by email, assign roles, and control access — suspend, restore or revoke at any time.
          </p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowInviteModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Invite Member
          </Button>
        )}
      </div>

      {/* ── Pending invitations (head only) ─────────────────────── */}
      {isLeadership && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" /> Pending Invitations
            </CardTitle>
            <CardDescription>
              Invitations are emailed by Clerk — invitees set their own password when accepting, then just log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedInvitations.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                No invitations sent yet. Invite your first member above.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedInvitations.map((inv) => {
                  const badge = INVITE_STATUS_BADGE[inv.status] ?? INVITE_STATUS_BADGE.pending;
                  return (
                    <div key={inv._id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3 min-w-0">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {inviteRoleLabel(inv.role)} ·{" "}
                            {new Date(inv.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {inv.status === "pending" && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleResend(inv._id)}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Resend
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleRevokeInvite(inv._id)}>
                              <Ban className="h-3.5 w-3.5 mr-1" /> Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Role legend ──────────────────────────────────────────── */}
      <Card className="border-l-2 border-l-secondary">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="text-xs">
              Role changes, suspensions and revocations are applied instantly in the backend. The affected member
              receives an in-app notification; suspended members see the head&apos;s message and cannot access any data.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Members ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        {members.map((member) => {
          const badge = STATUS_BADGE[member.status ?? "active"] ?? STATUS_BADGE.active;
          return (
            <Card key={member._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {member.name || member.email || "Unknown"}
                        {member.status === "suspended" && (
                          <span className="ml-2 text-xs text-destructive font-normal">— {member.statusMessage ?? "Suspended"}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.email && `${member.email} · `}
                        {inviteRoleLabel(member.role)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {isLeadership && (
                      <>
                        {member.status === "suspended" ? (
                          <Button variant="outline" size="sm" onClick={() => handleReactivate(member._id, member.name || member.email || "Member")}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setStatusAction({ member: { memberId: member._id, name: member.name || member.email || "Member" }, action: "suspend" }); setStatusMessage(""); }}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" /> Suspend
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setRoleChange({ memberId: member._id, name: member.name || member.email || "Member" }); setRoleChangeValue(member.role); setRoleChangeMessage(""); }}
                          title="Change role"
                        >
                          <Shield className="h-3.5 w-3.5 mr-1" /> Change role
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setStatusAction({ member: { memberId: member._id, name: member.name || member.email || "Member" }, action: "revoke" }); setStatusMessage(""); }}
                          title="Revoke access"
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {members.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No members yet</p>
            <p className="text-sm mt-1">Invite your first team member to get started</p>
          </div>
        )}
      </div>

      {/* ── Invite modal ─────────────────────────────────────────── */}
      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@school.com"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              An invitation email is sent automatically. They&apos;ll set their own password, then log in — no sign-up needed.
            </p>
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="">Select a role…</option>
              {inviteableRoles.map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </Select>
            {inviteRole && (
              <p className="text-xs text-muted-foreground mt-1">
                {inviteableRoles.find((r) => r.key === inviteRole)?.description}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowInviteModal(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <BrandLoader variant="dots" size="sm" className="mr-2" />}
              <Mail className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Suspend / revoke modal ───────────────────────────────── */}
      <Modal
        open={!!statusAction}
        onClose={() => setStatusAction(null)}
        title={statusAction?.action === "suspend" ? "Suspend Member" : "Revoke Access"}
      >
        {statusAction && (
          <form onSubmit={handleStatusSubmit} className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${statusAction.action === "revoke" ? "text-red-500" : "text-amber-500"}`} />
              <p className="text-muted-foreground">
                {statusAction.action === "suspend" ? (
                  <>
                    <strong className="text-foreground">{statusAction.member.name}</strong> will
                    be suspended: they can still log in, but they&apos;ll see a full-screen notice and won&apos;t be able to
                    access any school data. Fully reversible.
                  </>
                ) : (
                  <>
                    <strong className="text-foreground">{statusAction.member.name}</strong> will be
                    removed from this school entirely — their Clerk organization membership is deleted and their member
                    record is removed. This cannot be undone by them.
                  </>
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="statusMessage">
                Message to {statusAction.member.name} <span className="text-muted-foreground font-normal">(they will see this)</span>
              </Label>
              <textarea
                id="statusMessage"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                rows={3}
                placeholder={statusAction.action === "suspend" ? "e.g. Suspended pending review of the missing inventory." : "e.g. Access revoked — employment ended."}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setStatusAction(null)}>Cancel</Button>
              <Button type="submit" variant={statusAction.action === "revoke" ? "danger" : "default"}>
                {statusAction.action === "suspend" ? <Ban className="h-4 w-4 mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
                {statusAction.action === "suspend" ? "Suspend" : "Revoke Access"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Change role modal ────────────────────────────────────── */}
      <Modal open={!!roleChange} onClose={() => setRoleChange(null)} title={`Change Role — ${roleChange?.name ?? ""}`}>
        <form onSubmit={handleRoleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="newRole">New Role</Label>
            <Select id="newRole" value={roleChangeValue} onChange={(e) => setRoleChangeValue(e.target.value)}>
              {(roles ?? []).map((r) => (
                <option key={r.key} value={r.key}>{r.name}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {roles?.find((r) => r.key === roleChangeValue)?.description}
            </p>
          </div>
          <div>
            <Label htmlFor="roleMessage">
              Message <span className="text-muted-foreground font-normal">(optional — sent as an in-app notification)</span>
            </Label>
            <Input
              id="roleMessage"
              value={roleChangeMessage}
              onChange={(e) => setRoleChangeMessage(e.target.value)}
              placeholder="e.g. You now have access to the fees module."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setRoleChange(null)}>Cancel</Button>
            <Button type="submit">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Save Role
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
