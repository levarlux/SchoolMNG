"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Plus, Trash2, ArrowLeft, Users, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ClassDetailPage() {
  const { id } = useParams();
  const classId = id as string;
  const school = useSchool();

  const cls = useQuery(api.classes.get, { id: classId as any });
  const streams = useQuery(api.streams.listByClass, { classId: classId as any });
  const students = useQuery(api.students.listByClass, { classId: classId as any });
  const createStream = useMutation(api.streams.create);
  const deleteStream = useMutation(api.streams.remove);

  const [showModal, setShowModal] = useState(false);
  const [streamName, setStreamName] = useState("");

  async function handleCreateStream(e: React.FormEvent) {
    e.preventDefault();
    if (!streamName.trim()) return;
    try {
      await createStream({ classId: classId as any, name: streamName.trim() });
      toast.success("Stream created");
      setShowModal(false);
      setStreamName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[streams.create]", error);
    }
  }

  async function handleDeleteStream(id: string) {
    try {
      await deleteStream({ id: id as any });
      toast.success("Stream deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
      console.error("[streams.remove]", error);
    }
  }

  if (cls === undefined || cls === null || streams === undefined || students === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/classes">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{cls.name}</h1>
          <p className="text-muted-foreground mt-1">
            {cls.hasStreams ? "Streams enabled" : "No streams"} &middot; {students?.length ?? 0} students
          </p>
        </div>
      </div>

      {cls.hasStreams && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Streams</h2>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Stream
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {streams?.map((stream) => (
              <Card key={stream._id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{stream.name}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteStream(stream._id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        </>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Students</h2>
          <Link href="/dashboard/students">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" /> Manage Students
            </Button>
          </Link>
        </div>
        {students && students.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Adm No</th>
                  <th className="text-left p-3 font-medium">Stream</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s._id} className="border-t border-border">
                    <td className="p-3">{s.firstName} {s.lastName}</td>
                    <td className="p-3 text-muted-foreground">{s.admNo}</td>
                    <td className="p-3 text-muted-foreground">
                      {s.streamId ? streams?.find(st => st._id === s.streamId)?.name ?? "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground">No students in this class yet.</p>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Stream">
        <form onSubmit={handleCreateStream} className="space-y-4">
          <div>
            <Label htmlFor="streamName">Stream Name</Label>
            <Input id="streamName" value={streamName} onChange={(e) => setStreamName(e.target.value)} placeholder="e.g. East, West, A, B" required />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
