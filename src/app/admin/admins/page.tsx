"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, Trash2, UserPlus, Mail, Key } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

export default function AdminAdminsPage() {
  const admins = useQuery(api.admins.list);
  const createAdmin = useMutation(api.admins.create);
  const deleteAdmin = useMutation(api.admins.remove);

  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  if (admins === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("admin-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!userId.trim() || !email.trim()) {
      toast.error("Please fill all fields");
      return;
    }
    setLoading(true);
    try {
      await createAdmin({ userId: userId.trim(), email: email.trim() });
      toast.success("Admin added successfully");
      setShowModal(false);
      setUserId("");
      setEmail("");
    } catch (err) {
      toast.error("Failed to add admin");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Remove admin "${email}"?`)) return;
    try {
      await deleteAdmin({ id: id as any });
      toast.success("Admin removed");
    } catch (err) {
      toast.error("Failed to remove admin");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admins</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage platform administrators with full access
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Admin
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Shield className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{admins.length}</p>
                <p className="text-xs text-muted-foreground">Total Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Key className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{admins.filter((a) => a.role === "superadmin").length}</p>
                <p className="text-xs text-muted-foreground">Super Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{new Set(admins.map((a) => a.email)).size}</p>
                <p className="text-xs text-muted-foreground">Unique Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admins Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Admin</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">User ID</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Role</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No admins yet</p>
                    </td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin._id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {admin.email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{admin.email}</p>
                            <p className="text-xs text-muted-foreground">Platform Administrator</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-[150px]">
                          {admin.userId}
                        </p>
                      </td>
                      <td className="p-4">
                        <Badge variant="danger" className="capitalize">
                          {admin.role}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(admin._id, admin.email)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Admin Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Admin">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Clerk User ID</Label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="user_xxxxx"
              required
            />
            <p className="text-xs text-muted-foreground">
              Find this in the Clerk dashboard under Users
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@school.com"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
              {loading ? "Adding..." : "Add Admin"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
