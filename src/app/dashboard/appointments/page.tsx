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

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  rescheduled: "bg-yellow-100 text-yellow-800",
};

export default function AppointmentsPage() {
  const school = useSchool();
  const appointments = useQuery(
    api.appointments.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );
  const stats = useQuery(
    api.appointments.getStats,
    school ? { schoolId: school._id } : "skip"
  );
  const createAppointment = useMutation(api.appointments.create);
  const updateStatus = useMutation(api.appointments.updateStatus);
  const removeAppointment = useMutation(api.appointments.remove);

  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    withPerson: "",
    purpose: "",
    notes: "",
  });

  if (!school) return null;

  const filteredAppointments = appointments?.filter((a) => {
    if (filter === "all") return true;
    return a.status === filter;
  });

  const handleSubmit = async () => {
    await createAppointment({
      schoolId: school._id,
      title: form.title,
      date: new Date(form.date).getTime(),
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location || undefined,
      withPerson: form.withPerson,
      purpose: form.purpose,
      notes: form.notes || undefined,
    });
    setShowAdd(false);
    setForm({
      title: "",
      date: "",
      startTime: "",
      endTime: "",
      location: "",
      withPerson: "",
      purpose: "",
      notes: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <Button onClick={() => setShowAdd(true)}>New Appointment</Button>
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
            <div className="text-2xl font-bold text-blue-600">{stats?.scheduled ?? 0}</div>
            <div className="text-sm text-muted-foreground">Scheduled</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.today ?? 0}</div>
            <div className="text-sm text-muted-foreground">Today</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">{stats?.completed ?? 0}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["all", "scheduled", "completed", "cancelled", "rescheduled"].map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Appointments Grid */}
      {filteredAppointments && filteredAppointments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No appointments
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAppointments?.map((apt) => (
            <Card key={apt._id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{apt.title}</CardTitle>
                  <span className={`px-2 py-1 rounded-full text-xs ${statusColors[apt.status]}`}>
                    {apt.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">Date:</span>{" "}
                  {new Date(apt.date).toLocaleDateString()}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Time:</span>{" "}
                  {apt.startTime} - {apt.endTime}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">With:</span> {apt.withPerson}
                </div>
                {apt.location && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Location:</span> {apt.location}
                  </div>
                )}
                <div className="text-sm">
                  <span className="text-muted-foreground">Purpose:</span> {apt.purpose}
                </div>
                <div className="flex gap-2 pt-2">
                  {apt.status === "scheduled" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => updateStatus({ id: apt._id, status: "completed" })}
                      >
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus({ id: apt._id, status: "cancelled" })}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => removeAppointment({ id: apt._id })}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Appointment Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Appointment">
        <div className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
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
              <Label>Start Time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <Label>With Person</Label>
              <Input
                value={form.withPerson}
                onChange={(e) => setForm({ ...form, withPerson: e.target.value })}
              />
            </div>
            <div>
              <Label>Purpose</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <textarea
                className="w-full border rounded px-3 py-2"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Schedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
