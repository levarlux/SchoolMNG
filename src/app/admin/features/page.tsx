"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ToggleLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

export default function AdminFeaturesPage() {
  const schools = useQuery(api.schools.list);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const features = useQuery(
    api.feature_configurations.listBySchool,
    selectedSchoolId ? { schoolId: selectedSchoolId as any } : "skip"
  );
  const createFeature = useMutation(api.feature_configurations.create);
  const updateFeature = useMutation(api.feature_configurations.update);
  const deleteFeature = useMutation(api.feature_configurations.remove);

  const [showModal, setShowModal] = useState(false);
  const [featureName, setFeatureName] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [configJson, setConfigJson] = useState("{}");

  const selectedSchool = schools?.find((s) => s._id === selectedSchoolId);

  if (schools === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("feature-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!selectedSchoolId || !featureName.trim()) {
      toast.error("Please fill all fields");
      return;
    }
    let config: any = {};
    try {
      config = JSON.parse(configJson);
    } catch {
      toast.error("Invalid JSON in config");
      return;
    }
    await createFeature({
      schoolId: selectedSchoolId as any,
      featureName: featureName.trim(),
      isEnabled,
      config,
    });
    toast.success("Feature created");
    setShowModal(false);
    setFeatureName("");
    setIsEnabled(true);
    setConfigJson("{}");
  }

  async function handleToggle(feature: any) {
    await updateFeature({ id: feature._id, isEnabled: !feature.isEnabled });
    toast.success(`Feature ${feature.isEnabled ? "disabled" : "enabled"}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this feature configuration?")) return;
    await deleteFeature({ id: id as any });
    toast.success("Feature deleted");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feature Configurations</h1>
        <p className="text-muted-foreground mt-1">Manage feature flags per school.</p>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1">
          <Label htmlFor="school">School</Label>
          <Select id="school" value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
            <option value="">Select a school</option>
            {schools?.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </Select>
        </div>
        {selectedSchoolId && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Feature
          </Button>
        )}
      </div>

      {selectedSchool ? (
        <div className="space-y-2">
          {features?.map((feature) => (
            <Card key={feature._id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ToggleLeft className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{feature.featureName}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {JSON.stringify(feature.config)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={feature.isEnabled ? "success" : "secondary"}>
                      {feature.isEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => handleToggle(feature)}>
                      Toggle
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(feature._id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {features?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ToggleLeft className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No feature configurations for this school</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <ToggleLeft className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Select a school to manage its feature flags</p>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Feature">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="featureName">Feature Name</Label>
            <Input id="featureName" value={featureName} onChange={(e) => setFeatureName(e.target.value)} placeholder="e.g. enable_analytics" required />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isEnabled" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="rounded border-border" />
            <Label htmlFor="isEnabled">Enabled by default</Label>
          </div>
          <div>
            <Label htmlFor="config">Config (JSON)</Label>
            <textarea
              id="config"
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="flex h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
              placeholder='{"key": "value"}'
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Add Feature</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
