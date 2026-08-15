"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, Users, Leaf, AlertTriangle, Search, Plus } from "lucide-react";

export default function FeedingPage() {
  const school = useSchool();
  const [search, setSearch] = useState("");

  const boardingRows = useQuery(
    api.studentBoarding.listBySchoolWithBoarding,
    school ? { schoolId: school._id } : "skip"
  );

  if (school === undefined) {
    return <div className="flex items-center justify-center p-8"><BrandLoader variant="book" size="md" /></div>;
  }

  const allStudents = boardingRows ?? [];
  const filtered = search
    ? allStudents.filter((s) =>
        `${s.student.firstName} ${s.student.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        s.student.admNo.toLowerCase().includes(search.toLowerCase())
      )
    : allStudents;

  // Categorize students
  const dayScholars = filtered.filter((s) => !s.isBoarding);
  const boardingStudents = filtered.filter((s) => s.isBoarding);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Feeding</h1>
          <p className="text-muted-foreground mt-1">Manage student feeding plans and dietary requirements.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline"><Plus className="h-4 w-4 mr-2" /> Add Plan</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{allStudents.length}</p>
              <p className="text-xs text-muted-foreground">Total Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UtensilsCrossed className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{boardingStudents.length}</p>
              <p className="text-xs text-muted-foreground">Full Board</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Leaf className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold">{dayScholars.length}</p>
              <p className="text-xs text-muted-foreground">Day Scholars</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">Dietary Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Student List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" /> Full Board ({boardingStudents.length})
            </CardTitle>
            <CardDescription>Boarding students with meal plans</CardDescription>
          </CardHeader>
          <CardContent>
            {boardingStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No boarding students found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {boardingStudents.slice(0, 20).map((s) => (
                  <div key={s.student._id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {s.student.firstName[0]}{s.student.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.student.firstName} {s.student.lastName}</p>
                        <p className="text-xs text-muted-foreground">{s.student.admNo}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">Full Board</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="h-4 w-4" /> Day Scholars ({dayScholars.length})
            </CardTitle>
            <CardDescription>Day students (lunch only if applicable)</CardDescription>
          </CardHeader>
          <CardContent>
            {dayScholars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No day scholars found.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {dayScholars.slice(0, 20).map((s) => (
                  <div key={s.student._id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">
                        {s.student.firstName[0]}{s.student.lastName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.student.firstName} {s.student.lastName}</p>
                        <p className="text-xs text-muted-foreground">{s.student.admNo}</p>
                      </div>
                    </div>
                    <Badge variant="outline">Day Scholar</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
