"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole } from "@/lib/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Users, Plus, Trash2, Loader2, Shield, Mail } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  principal: "Principal",
};

const ROLE_BADGE_VARIANT: Record<string, string> = {
  teacher: "default",
  principal: "success",
};

export default function MembersPage() {
  const school = useSchool();
  const myRole = useRole();
  const isPrincipal = myRole === "principal";
  const members = useQuery(
    api.members.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const sendInvitation = useAction(api.invitations.sendInvitation);
  const updateRole = useMutation(api.members.updateRole);
  const removeMember = useMutation(api.members.remove);

  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"teacher" | "principal">("teacher");
  const [loading, setLoading] = useState(false);

  if (members === undefined || !school) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setLoading(true);
    try {
      await sendInvitation({
        schoolId: school!._id,
        email: email.trim(),
        role,
      });
      toast.success(`Invitation sent to ${email.trim()}`);
      setShowAddModal(false);
      setEmail("");
      setRole("teacher");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(memberId: Id<"members">, newRole: "teacher" | "principal") {
    try {
      await updateRole({ memberId, role: newRole });
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    }
  }

  async function handleRemove(memberId: Id<"members">) {
    if (!confirm("Remove this member from the school?")) return;
    try {
      await removeMember({ memberId });
      toast.success("Member removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove member");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Members</h1>
          <p className="text-muted-foreground mt-1">Manage who has access and their roles</p>
        </div>
        {isPrincipal && (
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Invite Member
          </Button>
        )}
      </div>

      {/* Role legend */}
      <Card className="border-l-2 border-l-secondary">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span><strong>Teacher</strong> — can borrow/return, mark attendance, view students</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Shield className="h-4 w-4" />
            <span><strong>Principal</strong> — full access: manage classes, subjects, teachers, timetable, reports, settings</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {members.map((member) => (
          <Card key={member._id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{member.name || member.email || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.email && `${member.email} · `}
                      ID: {member.userId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isPrincipal ? (
                    <>
                      <Select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member._id, e.target.value as any)}
                        className="w-40"
                      >
                        <option value="teacher">Teacher</option>
                        <option value="principal">Principal</option>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(member._id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-medium px-3 py-1 rounded bg-secondary/10">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {members.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No members yet</p>
            <p className="text-sm mt-1">Invite teachers or principals to your school</p>
          </div>
        )}
      </div>

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.com"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              An invitation email will be sent. They&apos;ll create their account and join your school.
            </p>
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Select id="role" value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="teacher">Teacher</option>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Only teacher invitations are supported. Contact a superadmin to add principals.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Mail className="h-4 w-4 mr-2" />
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
