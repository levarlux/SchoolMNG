"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Shield, Utensils, MapPin, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

const DUTY_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  gate: { label: "Gate Duty", icon: Shield, color: "text-blue-600" },
  lunch: { label: "Lunch Supervision", icon: Utensils, color: "text-orange-600" },
  compound: { label: "Compound", icon: MapPin, color: "text-green-600" },
  exam_supervision: { label: "Exam Supervision", icon: BookOpen, color: "text-purple-600" },
  other: { label: "Other", icon: Clock, color: "text-gray-600" },
};

export default function DutyRosterPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [showAdd, setShowAdd] = useState(false);

  const dateTimestamp = new Date(selectedDate).getTime();
  const entries = useQuery(
    api.dutyRoster.listByDate,
    school ? { schoolId: school._id, date: dateTimestamp } : "skip"
  );
  const teachers = useQuery(
    api.teachers.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const createEntry = useMutation(api.dutyRoster.create);
  const removeEntry = useMutation(api.dutyRoster.remove);

  const [teacherId, setTeacherId] = useState("");
  const [dutyType, setDutyType] = useState("gate");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !teacherId) {
      toast.error("Please select a teacher");
      return;
    }
    try {
      await createEntry({
        schoolId: school._id,
        teacherId: teacherId as any,
        date: dateTimestamp,
        dutyType: dutyType as any,
        description: description || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      });
      toast.success("Duty assigned");
      setShowAdd(false);
      setTeacherId("");
      setDescription("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!school) {
    return (
      <div className="flex items-center justify-center p-16">
        <BrandLoader variant="book" size="md" />
      </div>
    );
  }

  return (
    <EavRouteWrapper moduleName="Duty Roster" bucket="learner">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Duty Roster</h1>
          <p className="text-muted-foreground text-sm">Teacher duty assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          {isLeadership && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Assign Duty
            </Button>
          )}
        </div>
      </div>

      {entries === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
            No duties assigned for this date.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => {
            const config = DUTY_CONFIG[entry.dutyType];
            const Icon = config?.icon ?? Clock;
            return (
              <Card key={entry._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${config?.color ?? "text-gray-600"}`} />
                      <div>
                        <p className="font-medium">{config?.label ?? entry.dutyType}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.startTime && entry.endTime
                            ? `${entry.startTime} - ${entry.endTime}`
                            : "All day"}
                        </p>
                      </div>
                    </div>
                    {isLeadership && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive text-xs"
                        onClick={async () => {
                          try {
                            await removeEntry({ id: entry._id });
                            toast.success("Removed");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {entry.description && (
                    <p className="text-sm text-muted-foreground mt-2">{entry.description}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Assign Duty">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Teacher *</Label>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">Select teacher</option>
              {teachers?.map((t) => (
                <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duty Type *</Label>
              <Select value={dutyType} onChange={(e) => setDutyType(e.target.value)}>
                {Object.entries(DUTY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Assign</Button>
          </div>
        </form>
      </Modal>
    </div>
    </EavRouteWrapper>
  );
}

