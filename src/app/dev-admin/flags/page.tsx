"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import {
  Flag, Plus, ToggleLeft, ToggleRight, Clock,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// Feature flags (in production, these would come from a Convex table)
const INITIAL_FLAGS = [
  {
    id: "ocr-scanning",
    name: "OCR Document Scanning",
    description: "Enable camera-based document scanning with Tesseract.js",
    stage: "production" as const,
    updatedAt: "2026-08-08",
    updatedBy: "dev@schoolmng.com",
  },
  {
    id: "ai-onboarding",
    name: "AI-Assisted Onboarding",
    description: "Conversational onboarding wizard with AI suggestions",
    stage: "preview" as const,
    updatedAt: "2026-08-08",
    updatedBy: "dev@schoolmng.com",
  },
  {
    id: "parent-portal",
    name: "Parent Portal",
    description: "Allow parents to view their children's data",
    stage: "production" as const,
    updatedAt: "2026-08-01",
    updatedBy: "dev@schoolmng.com",
  },
  {
    id: "bulk-operations",
    name: "Bulk Operations",
    description: "Batch update/delete across modules",
    stage: "production" as const,
    updatedAt: "2026-08-05",
    updatedBy: "dev@schoolmng.com",
  },
  {
    id: "developer-admin",
    name: "Developer Admin Dashboard",
    description: "Internal engineering tools for release management",
    stage: "internal" as const,
    updatedAt: "2026-08-08",
    updatedBy: "dev@schoolmng.com",
  },
];

type Stage = "internal" | "preview" | "production";

const STAGES: { value: Stage; label: string; color: string }[] = [
  { value: "internal", label: "Internal", color: "bg-gray-100 text-gray-700" },
  { value: "preview", label: "Preview", color: "bg-blue-100 text-blue-700" },
  { value: "production", label: "Production", color: "bg-green-100 text-green-700" },
];

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState(INITIAL_FLAGS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlag, setNewFlag] = useState({ name: "", description: "" });

  function updateFlagStage(id: string, newStage: Stage) {
    setFlags((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, stage: newStage, updatedAt: new Date().toISOString().slice(0, 10) }
          : f
      )
    );
    toast.success(`Flag updated to ${newStage}`);
  }

  function createFlag() {
    if (!newFlag.name.trim()) {
      toast.error("Flag name is required");
      return;
    }
    setFlags((prev) => [
      ...prev,
      {
        id: newFlag.name.toLowerCase().replace(/\s+/g, "-"),
        name: newFlag.name,
        description: newFlag.description,
        stage: "internal",
        updatedAt: new Date().toISOString().slice(0, 10),
        updatedBy: "dev@schoolmng.com",
      },
    ]);
    setShowCreateModal(false);
    setNewFlag({ name: "", description: "" });
    toast.success("Flag created");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground mt-1">
            Manage feature rollouts across Internal → Preview → Production
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Flag
        </Button>
      </div>

      {/* Stage Legend */}
      <div className="flex items-center gap-4">
        {STAGES.map((s) => (
          <div key={s.value} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${s.color}`} />
            <span className="text-sm">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Flags List */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Flag</th>
                <th className="text-left p-3 font-medium">Stage</th>
                <th className="text-left p-3 font-medium">Updated</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.id} className="border-t border-border">
                  <td className="p-3">
                    <div>
                      <p className="font-medium">{flag.name}</p>
                      <p className="text-xs text-muted-foreground">{flag.description}</p>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        flag.stage === "production"
                          ? "success"
                          : flag.stage === "preview"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {flag.stage}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {flag.updatedAt}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {flag.stage !== "internal" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const prevStage = flag.stage === "production" ? "preview" : "internal";
                            updateFlagStage(flag.id, prevStage);
                          }}
                        >
                          ← Rollback
                        </Button>
                      )}
                      {flag.stage !== "production" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const nextStage = flag.stage === "internal" ? "preview" : "production";
                            updateFlagStage(flag.id, nextStage);
                          }}
                        >
                          Promote →
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Feature Flag"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Flag Name</label>
            <Input
              value={newFlag.name}
              onChange={(e) => setNewFlag((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Student Photo Upload"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={newFlag.description}
              onChange={(e) => setNewFlag((p) => ({ ...p, description: e.target.value }))}
              placeholder="What does this feature do?"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={createFlag}>Create Flag</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
