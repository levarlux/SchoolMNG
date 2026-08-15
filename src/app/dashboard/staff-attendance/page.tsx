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
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: typeof CheckCircle2 }> = {
  present: { label: "Present", variant: "success", icon: CheckCircle2 },
  absent: { label: "Absent", variant: "danger", icon: XCircle },
  late: { label: "Late", variant: "warning", icon: Clock },
  excused: { label: "Excused", variant: "secondary", icon: AlertTriangle },
};

export default function StaffAttendancePage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const dateTimestamp = new Date(selectedDate).getTime();
  const attendance = useQuery(
    api.staffAttendance.listByDate,
    school ? { schoolId: school._id, date: dateTimestamp } : "skip"
  );
  const teachers = useQuery(
    api.teachers.listBySchool,
    school ? { schoolId: school._id } : "skip"
  );

  const checkIn = useMutation(api.staffAttendance.checkIn);
  const markAbsent = useMutation(api.staffAttendance.markAbsent);
  const removeRecord = useMutation(api.staffAttendance.remove);

  const [showCheckIn, setShowCheckIn] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [status, setStatus] = useState("present");

  // Build attendance map
  const attendanceMap = new Map(attendance?.map((a) => [a.teacherId, a]));

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !teacherId) return;
    try {
      await checkIn({
        schoolId: school._id,
        teacherId: teacherId as any,
        date: dateTimestamp,
        status: status as any,
      });
      toast.success("Checked in");
      setShowCheckIn(false);
      setTeacherId("");
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

  const presentCount = attendance?.filter((a) => a.status === "present" || a.status === "late").length ?? 0;
  const absentCount = attendance?.filter((a) => a.status === "absent").length ?? 0;
  const totalCount = teachers?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff Attendance</h1>
          <p className="text-muted-foreground text-sm">Track teacher attendance</p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          {isLeadership && (
            <Button onClick={() => setShowCheckIn(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Check In
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold">{presentCount}</p>
              <p className="text-xs text-muted-foreground">Present</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-lg font-bold">{absentCount}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-lg font-bold">{totalCount - presentCount - absentCount}</p>
              <p className="text-xs text-muted-foreground">Not recorded</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Teacher list */}
      {teachers === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : (
        <div className="space-y-2">
          {teachers.map((teacher) => {
            const record = attendanceMap.get(teacher._id);
            const config = record ? STATUS_CONFIG[record.status] : null;
            const Icon = config?.icon ?? Clock;
            return (
              <Card key={teacher._id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${config ? (config.variant === "success" ? "text-green-600" : config.variant === "danger" ? "text-red-600" : config.variant === "warning" ? "text-yellow-600" : "text-muted-foreground") : "text-muted-foreground"}`} />
                    <div>
                      <p className="font-medium text-sm">{teacher.firstName} {teacher.lastName}</p>
                      <p className="text-xs text-muted-foreground">{teacher.staffNo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record ? (
                      <>
                        <Badge variant={config?.variant as any}>{config?.label}</Badge>
                        {record.checkInTime && (
                          <span className="text-xs text-muted-foreground">{record.checkInTime}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not recorded</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Check-in modal */}
      <Modal open={showCheckIn} onClose={() => setShowCheckIn(false)} title="Staff Check-In">
        <form onSubmit={handleCheckIn} className="space-y-4">
          <div>
            <Label>Teacher *</Label>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">Select teacher</option>
              {teachers?.filter((t) => !attendanceMap.has(t._id)).map((t) => (
                <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Status *</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="excused">Excused</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowCheckIn(false)}>Cancel</Button>
            <Button type="submit">Check In</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

