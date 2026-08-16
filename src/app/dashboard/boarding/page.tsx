"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { useRole, isLeadershipRole } from "@/lib/use-role";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Home, Users, Bed, Search, Plus, MapPin } from "lucide-react";
import { EavRouteWrapper } from "@/components/generic/EavRouteWrapper";

export default function BoardingPage() {
  const school = useSchool();
  const role = useRole();
  const isLeadership = isLeadershipRole(role);
  const [search, setSearch] = useState("");

  const boardingRows = useQuery(
    api.studentBoarding.listBySchoolWithBoarding,
    school ? { schoolId: school._id } : "skip"
  );

  if (school === undefined) {
    return <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>;
  }

  // Filter boarding students
  const boardingStudents = (boardingRows ?? []).filter((r) => r.isBoarding);
  const filtered = search
    ? boardingStudents.filter((r) =>
        `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        r.student.admNo.toLowerCase().includes(search.toLowerCase())
      )
    : boardingStudents;

  // Group by dorm
  const dorms = new Map<string, typeof filtered>();
  for (const s of filtered) {
    const dorm = s.dormName || "Unassigned";
    if (!dorms.has(dorm)) dorms.set(dorm, []);
    dorms.get(dorm)!.push(s);
  }

  return (
    <EavRouteWrapper moduleName="Boarding" bucket="learner">
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Boarding</h1>
          <p className="text-muted-foreground mt-1">Manage boarding houses, rooms, and student assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline"><Plus className="h-4 w-4 mr-2" /> Add Dorm</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Home className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{dorms.size}</p>
              <p className="text-xs text-muted-foreground">Dormitories</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{boardingStudents.length}</p>
              <p className="text-xs text-muted-foreground">Boarding Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Bed className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-2xl font-bold">{boardingStudents.filter((r) => r.roomNumber).length}</p>
              <p className="text-xs text-muted-foreground">Assigned Rooms</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-2xl font-bold">{boardingStudents.filter((r) => !r.dormName).length}</p>
              <p className="text-xs text-muted-foreground">Unassigned</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search boarding students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Dorm Groups */}
      {dorms.size === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Home className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg">No Boarding Students</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No students are marked as boarding. Set students as boarding in their profiles.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(dorms.entries()).map(([dorm, dormStudents]) => (
            <Card key={dorm}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="h-4 w-4" /> {dorm}
                  <Badge variant="secondary">{dormStudents.length} students</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {dormStudents.map((s) => (
                    <div key={s.student._id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {s.student.firstName[0]}{s.student.lastName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.student.firstName} {s.student.lastName}</p>
                        <p className="text-xs text-muted-foreground">
                          Room {s.roomNumber ?? "—"} · Bed {s.bedNumber ?? "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </EavRouteWrapper>
  );
}
