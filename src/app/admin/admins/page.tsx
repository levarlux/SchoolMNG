"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Shield, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

export default function AdminAdminsPage() {
  const admins = useQuery(api.admins.list);
  const createAdmin = useMutation(api.admins.create);
  const deleteAdmin = useMutation(api.admins.remove);

  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");

  if (admins === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
    await createAdmin({ userId: userId.trim(), email: email.trim() });
    toast.success("Admin created");
    setShowModal(false);
    setUserId("");
    setEmail("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this admin?")) return;
    await deleteAdmin({ id: id as any });
    toast.success("Admin removed");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admins</h1>
          <p className="text-muted-foreground mt-1">{admins?.length ?? 0} admin users</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Admin
        </Button>
      </div>

      <div className="space-y-2">
        {admins?.map((admin) => (
          <Card key={admin._id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{admin.email}</p>
                    <p className="text-xs text-muted-foreground">ID: {admin.userId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="danger">superadmin</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(admin._id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {admins?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No admin users yet</p>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Admin">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="userId">User ID (Clerk)</Label>
            <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_..." required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Super Admin</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
