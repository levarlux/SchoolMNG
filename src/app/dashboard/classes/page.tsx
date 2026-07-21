"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Plus, BookOpen, Trash2, Cog, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { checkRateLimit } from "@/lib/rate-limit";

export default function ClassesPage() {
  const school = useSchool();
  const role = useRole();
  const isPrincipal = role === "principal";
  const classes = useQuery(api.classes.listBySchool, school ? { schoolId: school._id } : "skip");
  const createClass = useMutation(api.classes.create);
  const deleteClass = useMutation(api.classes.remove);
  const createStream = useMutation(api.streams.create);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [hasStreams, setHasStreams] = useState(false);

  const [showStreamModal, setShowStreamModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [streamName, setStreamName] = useState("");

  if (classes === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!checkRateLimit("class-create", 5, 60_000)) {
      toast.error("Too many attempts. Please wait a moment before trying again.");
      return;
    }
    if (!school || !name.trim()) return;
    try {
      await createClass({ schoolId: school._id, name: name.trim(), hasStreams });
      toast.success("Class created");
      setShowModal(false);
      setName("");
      setHasStreams(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[classes.create]", error);
    }
  }

  async function handleCreateStream(e: React.FormEvent) {
    e.preventDefault();
    if (!streamName.trim() || !school || !selectedClassId) return;
    try {
      await createStream({ schoolId: school._id, classId: selectedClassId as any, name: streamName.trim() });
      toast.success("Stream created");
      setShowStreamModal(false);
      setStreamName("");
      setSelectedClassId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[streams.create]", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this class, its students, and all streams?")) return;
    try {
      await deleteClass({ id: id as any, force: true });
      toast.success("Class deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[classes.remove]", error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Classes</h1>
          <p className="text-muted-foreground mt-1">Manage classes and streams</p>
        </div>
        <div className="flex items-center gap-2">
          {classes && classes.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                exportToCsv(
                  classes.map((c) => ({ Name: c.name, HasStreams: c.hasStreams ? "Yes" : "No" })),
                  "classes"
                )
              }
            >
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          )}
          {isPrincipal && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Class
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes?.map((cls) => (
          <Card key={cls._id} className="hover:shadow-md transition-shadow border-l-2 border-l-secondary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{cls.name}</CardTitle>
              <div className="flex items-center gap-1">
                {cls.hasStreams && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedClassId(cls._id);
                      setShowStreamModal(true);
                    }}
                  >
                    <Cog className="h-4 w-4" />
                  </Button>
                )}
                {isPrincipal && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(cls._id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                {cls.hasStreams ? "Has streams" : "No streams"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Class">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="name">Class Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Form 1, Grade 10" required />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="hasStreams" checked={hasStreams} onChange={(e) => setHasStreams(e.target.checked)} className="rounded border-border" />
            <Label htmlFor="hasStreams">This class has streams (e.g. East/West, A/B)</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showStreamModal} onClose={() => { setShowStreamModal(false); setSelectedClassId(null); setStreamName(""); }} title="Create Stream">
        <form onSubmit={handleCreateStream} className="space-y-4">
          <div>
            <Label htmlFor="streamName">Stream Name</Label>
            <Input id="streamName" value={streamName} onChange={(e) => setStreamName(e.target.value)} placeholder="e.g. East, West, A, B" required />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => { setShowStreamModal(false); setSelectedClassId(null); setStreamName(""); }}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
