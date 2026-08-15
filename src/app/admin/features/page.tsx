"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ToggleLeft, Plus, Trash2, Settings, Search, CheckCircle2, XCircle, Building2, Zap, Code } from "lucide-react";
import { toast } from "sonner";
import { checkRateLimit } from "@/lib/rate-limit";

export default function AdminFeaturesPage() {
  const schools = useQuery(api.schools.list);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [search, setSearch] = useState("");
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
  const [loading, setLoading] = useState(false);

  const selectedSchool = schools?.find((s) => s._id === selectedSchoolId);

  const filteredSchools = schools?.filter((s) => {
    if (!search) return true;
    return s.name.toLowerCase().includes(search.toLowerCase());
  });

  if (schools === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
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
    setLoading(true);
    try {
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
    } catch (err) {
      toast.error("Failed to create feature");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(feature: any) {
    try {
      await updateFeature({ id: feature._id, isEnabled: !feature.isEnabled });
      toast.success(`Feature ${feature.isEnabled ? "disabled" : "enabled"}`);
    } catch (err) {
      toast.error("Failed to toggle feature");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete feature "${name}"?`)) return;
    try {
      await deleteFeature({ id: id as any });
      toast.success("Feature deleted");
    } catch (err) {
      toast.error("Failed to delete feature");
    }
  }

  const enabledCount = features?.filter((f) => f.isEnabled).length ?? 0;
  const disabledCount = features?.filter((f) => !f.isEnabled).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feature Flags</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage feature configurations per school
          </p>
        </div>
        {selectedSchoolId && (
          <Button onClick={() => setShowModal(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Feature
          </Button>
        )}
      </div>

      {/* School Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">Select School</Label>
              <Select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
                <option value="">Choose a school to manage</option>
                {filteredSchools?.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </Select>
            </div>
            {selectedSchool && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: selectedSchool.primaryColor || "#6366f1" }}
                >
                  {selectedSchool.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{selectedSchool.name}</p>
                  <p className="text-xs text-muted-foreground">/{selectedSchool.slug}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {selectedSchoolId && features && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Settings className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{features.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{enabledCount}</p>
                  <p className="text-xs text-muted-foreground">Enabled</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50">
                  <XCircle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{disabledCount}</p>
                  <p className="text-xs text-muted-foreground">Disabled</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Features List */}
      {selectedSchoolId ? (
        features && features.length > 0 ? (
          <div className="space-y-2">
            {features.map((feature) => (
              <Card key={feature._id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleToggle(feature)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          feature.isEnabled ? "bg-green-500" : "bg-muted"
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            feature.isEnabled ? "left-7" : "left-1"
                          }`}
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{feature.featureName}</p>
                          <Badge variant={feature.isEnabled ? "success" : "secondary"}>
                            {feature.isEnabled ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Code className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">
                            {JSON.stringify(feature.config)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(feature._id, feature.featureName)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ToggleLeft className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">No features configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add feature flags to control functionality for this school
              </p>
              <Button onClick={() => setShowModal(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add First Feature
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium mb-1">Select a school</h3>
            <p className="text-sm text-muted-foreground">
              Choose a school above to manage its feature flags
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Feature Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Feature">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Feature Name</Label>
            <Input
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
              placeholder="e.g. enable_analytics, dark_mode"
              required
            />
            <p className="text-xs text-muted-foreground">
              Use snake_case for feature names
            </p>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <button
              type="button"
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                isEnabled ? "bg-green-500" : "bg-muted"
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  isEnabled ? "left-7" : "left-1"
                }`}
              />
            </button>
            <div>
              <p className="text-sm font-medium">{isEnabled ? "Enabled" : "Disabled"}</p>
              <p className="text-xs text-muted-foreground">Feature state on creation</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Configuration (JSON)</Label>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="flex h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
              placeholder='{"key": "value"}'
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
              {loading ? "Adding..." : "Add Feature"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
