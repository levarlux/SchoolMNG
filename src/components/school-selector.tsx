"use client";

import { useState } from "react";
import { useOrganizationList, useOrganization } from "@clerk/clerk-react";
import { setDesktopSchoolSlug } from "@/lib/use-school-slug";
import { Button } from "@/components/ui/button";
import { Library, Building2 } from "lucide-react";

export function SchoolSelector() {
  const { organization } = useOrganization();
  const { userMemberships, isLoaded } = useOrganizationList({
    userMemberships: true,
  });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const memberships = userMemberships?.data ?? [];

  async function handleSelectSchool(slug: string) {
    setLoading(true);
    setSelectedSlug(slug);
    try {
      setDesktopSchoolSlug(slug);
      window.location.reload();
    } catch (err) {
      console.error("Failed to select school:", err);
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (organization) {
    return null;
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <div className="rounded-2xl bg-primary p-4">
            <Library className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">School Library Manager</h1>
          <p className="text-muted-foreground text-lg">
            No schools found. Contact your administrator to get access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="rounded-2xl bg-primary p-4">
          <Library className="h-12 w-12 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Select School</h1>
        <p className="text-muted-foreground text-lg">
          Choose which school you want to manage.
        </p>
        <div className="w-full space-y-2">
          {memberships.map((membership: any) => {
            const org = membership.organization;
            const slug = org.slug || org.name.toLowerCase().replace(/\s+/g, "-");
            const isSelected = selectedSlug === slug;
            return (
              <Button
                key={org.id}
                variant="outline"
                size="lg"
                className="w-full justify-start gap-3"
                disabled={loading}
                onClick={() => handleSelectSchool(slug)}
              >
                <Building2 className="h-5 w-5" />
                <span className="flex-1 text-left">{org.name}</span>
                {isSelected && loading && (
                  <span className="text-xs text-muted-foreground">Loading...</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
