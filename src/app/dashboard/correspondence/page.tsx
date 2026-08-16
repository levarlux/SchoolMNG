"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

const statusColors: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  pending_action: "bg-yellow-100 text-yellow-800",
  actioned: "bg-green-100 text-green-800",
  filed: "bg-gray-100 text-gray-800",
};

export default function CorrespondencePage() {
  const school = useSchool();
  const correspondence = useQuery(
    api.correspondence.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.correspondence.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createCorrespondence = useMutation(api.correspondence.create);
  const updateStatus = useMutation(api.correspondence.updateStatus);
  const removeCorrespondence = useMutation(api.correspondence.remove);

  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({
    direction: "incoming" as "incoming" | "outgoing",
    referenceNumber: "",
    date: "",
    fromTo: "",
    subject: "",
    summary: "",
    category: "",
    assignedTo: "",
    notes: "",
  });

  if (!school) return null;

  const filteredCorrespondence = correspondence?.filter((c) => {
    if (filter === "all") return true;
    if (filter === "incoming") return c.direction === "incoming";
    if (filter === "outgoing") return c.direction === "outgoing";
    return c.status === filter;
  });

  const handleSubmit = async () => {
    await createCorrespondence({
      schoolId: school._id,
      direction: form.direction,
      referenceNumber: form.referenceNumber,
      date: new Date(form.date).getTime(),
      fromTo: form.fromTo,
      subject: form.subject,
      summary: form.summary || undefined,
      category: form.category,
      assignedTo: form.assignedTo || undefined,
      notes: form.notes || undefined,
    });
    setShowAdd(false);
    setForm({
      direction: "incoming",
      referenceNumber: "",
      date: "",
      fromTo: "",
      subject: "",
      summary: "",
      category: "",
      assignedTo: "",
      notes: "",
    });
  };

  return (
    <EavRouteWrapper moduleName="Correspondence" bucket="learner">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Correspondence</h1>
        <Button onClick={() => setShowAdd(true)}>New Correspondence</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats?.incoming ?? 0}</div>
            <div className="text-sm text-muted-foreground">Incoming</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.outgoing ?? 0}</div>
            <div className="text-sm text-muted-foreground">Outgoing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending ?? 0}</div>
            <div className="text-sm text-muted-foreground">Pending Action</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "incoming", "outgoing", "pending_action", "actioned", "filed"].map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f.replace("_", " ")}
          </Button>
        ))}
      </div>

      {/* Correspondence Table */}
      <Card>
        <CardHeader>
          <CardTitle>Correspondence Records</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCorrespondence && filteredCorrespondence.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No correspondence records</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Ref</th>
                    <th className="text-left py-2">Direction</th>
                    <th className="text-left py-2">From/To</th>
                    <th className="text-left py-2">Subject</th>
                    <th className="text-left py-2">Category</th>
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCorrespondence?.map((item) => (
                    <tr key={item._id} className="border-b hover:bg-muted/50">
                      <td className="py-2 font-medium">{item.referenceNumber}</td>
                      <td className="py-2 capitalize">{item.direction}</td>
                      <td className="py-2">{item.fromTo}</td>
                      <td className="py-2">{item.subject}</td>
                      <td className="py-2">{item.category}</td>
                      <td className="py-2">{new Date(item.date).toLocaleDateString()}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${statusColors[item.status]}`}>
                          {item.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          {item.status === "received" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus({ id: item._id, status: "pending_action" })}
                            >
                              Action
                            </Button>
                          )}
                          {item.status === "pending_action" && (
                            <Button
                              size="sm"
                              onClick={() => updateStatus({ id: item._id, status: "actioned" })}
                            >
                              Done
                            </Button>
                          )}
                          {item.status === "actioned" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus({ id: item._id, status: "filed" })}
                            >
                              File
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => removeCorrespondence({ id: item._id })}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Correspondence Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Correspondence">
        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Direction</Label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as any })}
              >
                <option value="incoming">Incoming</option>
                <option value="outgoing">Outgoing</option>
              </select>
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input
                value={form.referenceNumber}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <Label>From/To</Label>
              <Input
                value={form.fromTo}
                onChange={(e) => setForm({ ...form, fromTo: e.target.value })}
                placeholder="Person or organization"
              />
            </div>
            <div className="col-span-2">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Official, Academic, Administrative"
              />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Input
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Summary</Label>
              <textarea
                className="w-full border rounded px-3 py-2"
                rows={3}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
    </EavRouteWrapper>
  );
}
