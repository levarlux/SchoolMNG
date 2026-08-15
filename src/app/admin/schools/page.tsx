"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Building2, Search, Plus, MoreHorizontal, Pencil, Trash2, Ban, CheckCircle2, Globe, Filter, Download, Users, BookOpen } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Doc } from "@/convex/_generated/dataModel";
import { getBaseDomain } from "@/lib/app-domain";

export default function AdminSchoolsPage() {
  const schools = useQuery(api.schools.list);
  const adminCreate = useAction(api.admin.create);
  const adminUpdate = useAction(api.admin.update);
  const adminRemove = useAction(api.admin.remove);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<Doc<"schools"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editClerkOrgId, setEditClerkOrgId] = useState("");
  const [saving, setSaving] = useState(false);

  if (schools === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  const filtered = schools.filter((s) => {
    const matchesSearch = !search || 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: schools.length,
    active: schools.filter((s) => s.status === "active").length,
    trial: schools.filter((s) => s.status === "trial").length,
    suspended: schools.filter((s) => s.status === "suspended").length,
  };

  async function handleCreate() {
    if (!name || !slug) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await adminCreate({
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
      });
      toast.success("School created successfully!");
      resetCreateForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to create school: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  function resetCreateForm() {
    setOpen(false);
    setName("");
    setSlug("");
  }

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-"));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schools</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage all registered schools on the platform
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Register School
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
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
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Globe className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.trial}</p>
                <p className="text-xs text-muted-foreground">Trial</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50">
                <Ban className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.suspended}</p>
                <p className="text-xs text-muted-foreground">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {["all", "active", "trial", "suspended"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Schools Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">School</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden md:table-cell">Domain</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-sm text-muted-foreground hidden lg:table-cell">Clerk Org</th>
                  <th className="text-right p-4 font-medium text-sm text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No schools found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((school) => (
                    <tr key={school._id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                            style={{ backgroundColor: school.primaryColor || "#6366f1" }}
                          >
                            {school.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{school.name}</p>
                            <p className="text-xs text-muted-foreground">/{school.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <p className="text-sm text-muted-foreground">
                          {school.slug}.{getBaseDomain()}
                        </p>
                      </td>
                      <td className="p-4">
                        <Badge
                          variant={
                            school.status === "suspended"
                              ? "danger"
                              : school.status === "trial"
                              ? "warning"
                              : "success"
                          }
                        >
                          {school.status ?? "active"}
                        </Badge>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-[120px]">
                          {school.clerkOrgId}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingSchool(school);
                              setEditName(school.name);
                              setEditSlug(school.slug);
                              setEditClerkOrgId(school.clerkOrgId);
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const newStatus = school.status === "suspended" ? "active" : "suspended";
                              if (!confirm(`${newStatus === "suspended" ? "Suspend" : "Reactivate"} "${school.name}"?`)) return;
                              try {
                                await adminUpdate({
                                  id: school._id,
                                  name: school.name,
                                  slug: school.slug,
                                  clerkOrgId: school.clerkOrgId,
                                  status: newStatus,
                                });
                                toast.success(`School ${newStatus === "suspended" ? "suspended" : "reactivated"}`);
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : "Unknown error";
                                toast.error(`Failed: ${msg}`);
                              }
                            }}
                          >
                            {school.status === "suspended" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <Ban className="h-4 w-4 text-orange-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!confirm(`Delete "${school.name}"?\n\nThe Clerk organisation will also be deleted.`)) return;
                              try {
                                await adminRemove({ id: school._id });
                                toast.success("School deleted");
                              } catch (err: unknown) {
                                const msg = err instanceof Error ? err.message : "Unknown error";
                                toast.error(`Delete failed: ${msg}`);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal open={open} onClose={resetCreateForm} title="Register New School">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>School Name</Label>
            <Input
              placeholder="e.g. Oakridge Academy"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Subdomain / Slug</Label>
            <Input
              placeholder="e.g. oakridge"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              School will be accessible at <strong>{slug || "{slug}"}.{getBaseDomain()}</strong>
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetCreateForm} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name || !slug || loading}>
              {loading ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
              {loading ? "Creating..." : "Create School"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit School">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!editingSchool) return;
            setSaving(true);
            try {
              await adminUpdate({
                id: editingSchool._id,
                name: editName,
                slug: editSlug,
                clerkOrgId: editClerkOrgId,
              });
              toast.success("School updated");
              setEditOpen(false);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              toast.error(`Failed: ${msg}`);
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>School Name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Subdomain / Slug</Label>
            <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Clerk Organisation ID</Label>
            <Input
              value={editClerkOrgId}
              onChange={(e) => setEditClerkOrgId(e.target.value)}
              required
              className="font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <BrandLoader variant="dots" size="sm" className="mr-2" /> : null}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
