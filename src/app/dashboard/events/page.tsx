"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Plus, Search, Loader2, Calendar, Trash2 } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  { value: "academic", label: "Academic", color: "bg-blue-100 text-blue-800" },
  { value: "holiday", label: "Holiday", color: "bg-green-100 text-green-800" },
  { value: "exam", label: "Exam", color: "bg-red-100 text-red-800" },
  { value: "sports", label: "Sports", color: "bg-orange-100 text-orange-800" },
  { value: "cultural", label: "Cultural", color: "bg-purple-100 text-purple-800" },
  { value: "meeting", label: "Meeting", color: "bg-gray-100 text-gray-800" },
  { value: "other", label: "Other", color: "bg-yellow-100 text-yellow-800" },
];

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export default function EventsPage() {
  const school = useSchool();
  const events = useQuery(api.events.listBySchool, school ? { schoolId: school._id } : "skip");
  const createEvent = useMutation(api.events.create);
  const deleteEvent = useMutation(api.events.remove);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eventType, setEventType] = useState("academic");
  const [isHoliday, setIsHoliday] = useState(false);

  if (events === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = events.filter((e) => {
    if (!search) return true;
    return e.title.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => a.startDate - b.startDate);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !title.trim() || !startDate || !endDate) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createEvent({
        schoolId: school._id,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
        eventType: eventType as any,
        isHoliday,
      });
      toast.success("Event created");
      setShowModal(false);
      setTitle("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setEventType("academic");
      setIsHoliday(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create event");
    }
  }

  async function handleDelete(id: Id<"events">) {
    if (!confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteEvent({ id });
      toast.success("Event deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete event");
    }
  }

  const now = Date.now();
  const upcoming = filtered.filter((e) => e.endDate >= now);
  const past = filtered.filter((e) => e.endDate < now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">School Events</h1>
          <p className="text-muted-foreground mt-1">{events.length} total events</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Event
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((ev) => {
              const typeInfo = EVENT_TYPES.find((t) => t.value === ev.eventType);
              return (
                <Card key={ev._id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{ev.title}</CardTitle>
                      <button
                        onClick={() => handleDelete(ev._id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo?.color ?? "bg-gray-100"}`}>
                      {typeInfo?.label ?? ev.eventType}
                      {ev.isHoliday && " (Holiday)"}
                    </span>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(ev.startDate)} - {formatDate(ev.endDate)}</span>
                    </div>
                    {ev.description && (
                      <p className="text-sm text-muted-foreground">{ev.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Past Events</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {past.map((ev) => {
              const typeInfo = EVENT_TYPES.find((t) => t.value === ev.eventType);
              return (
                <Card key={ev._id} className="opacity-60">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{ev.title}</CardTitle>
                      <button
                        onClick={() => handleDelete(ev._id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo?.color ?? "bg-gray-100"}`}>
                      {typeInfo?.label ?? ev.eventType}
                    </span>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(ev.startDate)} - {formatDate(ev.endDate)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No events found
          </CardContent>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Event">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="title">Event Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Sports Day" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="eventType">Type</Label>
              <Select id="eventType" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <div className="flex items-center gap-2">
                <input
                  id="isHoliday"
                  type="checkbox"
                  checked={isHoliday}
                  onChange={(e) => setIsHoliday(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isHoliday" className="text-sm">Is Holiday</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Create Event</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
