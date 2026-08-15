"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

type BucketType = "learner" | "teaching_staff" | "non_teaching_staff" | "admin_staff" | "leadership";

interface RecordListProps {
  bucket: BucketType;
  onSelect?: (recordId: string) => void;
  createFields?: { name: string; value: string }[];
}

/**
 * Displays a paginated list of records in a bucket.
 * Supports search, create, and delete.
 */
export function RecordList({ bucket, onSelect, createFields }: RecordListProps) {
  const school = useSchool();
  const records = useQuery(
    api.records.listBySchoolAndBucket,
    school ? { schoolId: school._id, bucket } : "skip"
  );

  const createRecord = useMutation(api.records.create);
  const removeRecord = useMutation(api.records.remove);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = records?.filter((r) => {
    if (!search) return true;
    return r.displayName.toLowerCase().includes(search.toLowerCase());
  });

  async function handleCreate() {
    if (!school || !newName.trim()) return;
    setSaving(true);
    try {
      await createRecord({
        schoolId: school._id,
        bucket: bucket as BucketType,
        displayName: newName.trim(),
        status: "active",
      });
      toast.success("Record created");
      setShowCreate(false);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    try {
      await removeRecord({ id: id as any });
      toast.success("Record deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (records === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No records found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered?.map((record) => (
                <div
                  key={record._id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => onSelect?.(record._id)}
                  >
                    {record.photoUrl ? (
                      <img src={record.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {record.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{record.displayName}</p>
                      {record.status && (
                        <Badge variant={record.status === "active" ? "success" : "default"} className="text-xs mt-0.5">
                          {record.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(record._id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {onSelect && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Record">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name *</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter name"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !newName.trim()}>
              {saving && <BrandLoader variant="dots" size="sm" className="mr-2" />}
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
