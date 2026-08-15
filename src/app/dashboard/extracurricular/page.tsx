"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Trophy, Users, Search, MapPin, Clock as ClockIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  sports: { label: "Sports", color: "bg-green-100 text-green-800" },
  clubs: { label: "Clubs", color: "bg-blue-100 text-blue-800" },
  arts: { label: "Arts", color: "bg-purple-100 text-purple-800" },
  debate: { label: "Debate", color: "bg-orange-100 text-orange-800" },
  community_service: { label: "Community Service", color: "bg-teal-100 text-teal-800" },
  other: { label: "Other", color: "bg-gray-100 text-gray-800" },
};

export default function ExtracurricularPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const activities = useQuery(
    api.extracurricular.listActivities,
    school && categoryFilter !== "all"
      ? { schoolId: school._id, category: categoryFilter as any }
      : school
      ? { schoolId: school._id }
      : "skip"
  );

  const createActivity = useMutation(api.extracurricular.createActivity);
  const enrollStudent = useMutation(api.extracurricular.enrollStudent);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("clubs");
  const [schedule, setSchedule] = useState("");
  const [venue, setVenue] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school || !name.trim()) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await createActivity({
        schoolId: school._id,
        name: name.trim(),
        description: description || undefined,
        category: category as any,
        schedule: schedule || undefined,
        venue: venue || undefined,
      });
      toast.success("Activity created");
      setShowAdd(false);
      setName("");
      setDescription("");
      setSchedule("");
      setVenue("");
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Extracurricular Activities</h1>
          <p className="text-muted-foreground text-sm">
            Manage sports, clubs, arts, and other student activities
          </p>
        </div>
        {isLeadership && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Activity
          </Button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              categoryFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* Activities grid */}
      {activities === undefined ? (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      ) : activities.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>No activities found. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => {
            const catConfig = CATEGORY_CONFIG[activity.category];
            return (
              <Card
                key={activity._id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedActivity(activity._id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{activity.name}</CardTitle>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catConfig.color}`}>
                      {catConfig.label}
                    </span>
                  </div>
                  {activity.description && (
                    <CardDescription className="text-xs line-clamp-2">
                      {activity.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {activity.venue && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {activity.venue}
                      </span>
                    )}
                    {activity.schedule && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" /> {activity.schedule}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Activity detail modal */}
      {selectedActivity && (
        <ActivityDetailModal
          activityId={selectedActivity}
          schoolId={school._id}
          onClose={() => setSelectedActivity(null)}
          isLeadership={isLeadership}
        />
      )}

      {/* Add activity modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Activity">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label>Activity Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Football Club, Drama Society"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category *</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Venue</Label>
              <Input
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. School Field"
              />
            </div>
          </div>
          <div>
            <Label>Schedule</Label>
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g. Every Tuesday & Thursday, 3-5pm"
            />
          </div>
          <div>
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Create Activity</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// â”€â”€ Activity Detail Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ActivityDetailModal({
  activityId,
  schoolId,
  onClose,
  isLeadership,
}: {
  activityId: string;
  schoolId: string;
  onClose: () => void;
  isLeadership: boolean;
}) {
  const activities = useQuery(api.extracurricular.listActivities, { schoolId: schoolId as any });
  const activity = activities?.find((a) => a._id === activityId);
  const participants = useQuery(
    api.extracurricular.listStudentsByActivity,
    { activityId: activityId as any }
  );
  const students = useQuery(api.students.listBySchool, { schoolId: schoolId as any });
  const enrollStudent = useMutation(api.extracurricular.enrollStudent);
  const unenrollStudent = useMutation(api.extracurricular.unenrollStudent);

  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState("");

  async function handleEnroll() {
    if (!enrollStudentId) return;
    try {
      await enrollStudent({
        schoolId: schoolId as any,
        studentId: enrollStudentId as any,
        activityId: activityId as any,
      });
      toast.success("Student enrolled");
      setShowEnroll(false);
      setEnrollStudentId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Modal open onClose={onClose} title={activity?.name ?? "Activity"}>
      {activity ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {activity.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {activity.venue}
              </span>
            )}
            {activity.schedule && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" /> {activity.schedule}
              </span>
            )}
          </div>
          {activity.description && (
            <p className="text-sm text-muted-foreground">{activity.description}</p>
          )}

          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">
              Participants ({participants?.length ?? 0})
            </h4>
            {isLeadership && (
              <Button size="sm" variant="outline" onClick={() => setShowEnroll(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> Enroll
              </Button>
            )}
          </div>

          {participants && participants.length > 0 ? (
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p._id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Student {p.studentId.slice(-6)}</span>
                    {p.role && <Badge variant="secondary" className="text-xs">{p.role}</Badge>}
                  </div>
                  {isLeadership && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive text-xs"
                      onClick={async () => {
                        try {
                          await unenrollStudent({ id: p._id });
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
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No participants yet</p>
          )}

          {/* Enroll modal */}
          {showEnroll && (
            <Modal open onClose={() => setShowEnroll(false)} title="Enroll Student">
              <div className="space-y-4">
                <Select value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)}>
                  <option value="">Select student</option>
                  {students?.map((s) => (
                    <option key={s._id} value={s._id}>{s.firstName} {s.lastName}</option>
                  ))}
                </Select>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowEnroll(false)}>Cancel</Button>
                  <Button onClick={handleEnroll} disabled={!enrollStudentId}>Enroll</Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center p-8">
          <BrandLoader variant="book" size="md" />
        </div>
      )}
    </Modal>
  );
}

