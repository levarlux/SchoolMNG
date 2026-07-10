"use client";

import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Shield, CreditCard, BookOpen } from "lucide-react";
import { useIsSuperadmin } from "@/lib/use-admin";

export default function AdminOverview() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const isSuperadmin = useIsSuperadmin();

  const canQuery = !isLoading && isAuthenticated && isSuperadmin;

  const schools = useQuery(api.schools.list, canQuery ? {} : "skip");
  const admins = useQuery(api.admins.list, canQuery ? {} : "skip");
  const subscriptions = useQuery(api.subscriptions.list, canQuery ? {} : "skip");

  const stats = [
    { label: "Schools", value: schools?.length ?? 0, icon: Building2, color: "text-blue-600" },
    { label: "Admins", value: admins?.length ?? 0, icon: Shield, color: "text-purple-600" },
    { label: "Subscriptions", value: subscriptions?.length ?? 0, icon: CreditCard, color: "text-green-600" },
  ];

  const activeSubs = subscriptions?.filter((s) => s.status === "active").length ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Super Admin</h1>
        <p className="text-muted-foreground mt-1">System-wide overview and management.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-lg font-semibold mb-2">Subscription Overview</h2>
          <p className="text-sm text-muted-foreground">
            {activeSubs} active subscription{activeSubs !== 1 ? "s" : ""} out of {subscriptions?.length ?? 0} total
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
