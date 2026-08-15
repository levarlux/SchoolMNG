"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { ShieldCheck, Plus, FileText, AlertTriangle, CheckCircle, Clock, Trash2 } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

const docTypes = ["registration", "inspection", "policy", "certificate", "other"] as const;

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-red-100 text-red-800",
  pending_renewal: "bg-yellow-100 text-yellow-800",
};

export default function CompliancePage() {
  const school = useSchool();
  const docs = useQuery(
    api.compliance.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.compliance.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createDoc = useMutation(api.compliance.create);
  const removeDoc = useMutation(api.compliance.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    documentType: "registration" as typeof docTypes[number],
    description: "",
    renewalDate: "",
    notes: "",
  });

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    await createDoc({
      schoolId: school!._id,
      title: form.title.trim(),
      documentType: form.documentType,
      description: form.description.trim() || undefined,
      renewalDate: form.renewalDate ? new Date(form.renewalDate).getTime() : undefined,
      notes: form.notes.trim() || undefined,
    });
    toast.success("Document added");
    setModalOpen(false);
    setForm({ title: "", documentType: "registration", description: "", renewalDate: "", notes: "" });
  };

  const handleDelete = async (id: Id<"compliance_documents">) => {
    if (!confirm("Delete this document?")) return;
    await removeDoc({ id });
    toast.success("Document deleted");
  };

  if (!school) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Compliance</h1>
            <p className="text-muted-foreground text-sm">
              Track compliance documents, accreditations, and inspections
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Document
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.active ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.pendingRenewal ?? 0}</p>
                <p className="text-xs text-muted-foreground">Pending Renewal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats?.expired ?? 0}</p>
                <p className="text-xs text-muted-foreground">Expired</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {!docs || docs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No compliance documents yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{doc.title}</p>
                      <Badge className={statusColors[doc.status] || ""}>{doc.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {doc.documentType}
                    </p>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      {doc.uploadedBy && <span>Uploaded by: {doc.uploadedBy}</span>}
                      {doc.uploadedAt && <span>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}</span>}
                      {doc.renewalDate && <span>Renewal: {new Date(doc.renewalDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(doc._id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Compliance Document">
        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Document title"
            />
          </div>
          <div>
            <Label>Document Type</Label>
            <select
              className="w-full border border-border rounded-md p-2 bg-background text-sm"
              value={form.documentType}
              onChange={(e) => setForm({ ...form, documentType: e.target.value as typeof docTypes[number] })}
            >
              {docTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description"
            />
          </div>
          <div>
            <Label>Renewal Date</Label>
            <Input
              type="date"
              value={form.renewalDate}
              onChange={(e) => setForm({ ...form, renewalDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Additional notes"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Add Document</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
