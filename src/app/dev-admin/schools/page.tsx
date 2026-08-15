"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Building2, Search, Shield, Eye } from "lucide-react";

export default function SchoolsMetadataPage() {
  const schools = useQuery(api.schools.list);
  const featureConfigs = useQuery(api.feature_configurations.listAll);
  const [search, setSearch] = useState("");

  const filtered = schools?.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">School Metadata</h1>
        <p className="text-muted-foreground mt-1">
          Read-only view of school configurations — no record data exposed
        </p>
      </div>

      {/* Warning Banner */}
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">Read-Only Access</p>
              <p className="text-sm text-yellow-700">
                This dashboard shows school metadata and config only — no student, staff, or guardian records.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search schools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Schools Table */}
      <Card>
        <CardHeader>
          <CardTitle>Schools ({filtered?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">School</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Primary Color</th>
                  <th className="text-left p-3 font-medium">Features Enabled</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((school) => {
                  const schoolFeatures = featureConfigs?.filter(
                    (f) => f.schoolId === school._id && f.isEnabled
                  );
                  return (
                    <tr key={school._id} className="border-t border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{school.name}</p>
                            <p className="text-xs text-muted-foreground">{school.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            school.status === "suspended"
                              ? "danger"
                              : school.status === "trial"
                                ? "warning"
                                : "success"
                          }
                        >
                          {school.status ?? "active"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border border-border"
                            style={{ backgroundColor: school.primaryColor }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {school.primaryColor}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {schoolFeatures?.slice(0, 3).map((f) => (
                            <Badge key={f._id} variant="secondary" className="text-xs">
                              {f.featureName}
                            </Badge>
                          ))}
                          {(schoolFeatures?.length ?? 0) > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(schoolFeatures?.length ?? 0) - 3} more
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <a
                          href={`/admin/schools`}
                          className="text-primary hover:underline text-sm"
                        >
                          View in Admin →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
