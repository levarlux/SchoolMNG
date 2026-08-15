"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PaywallWrapper } from "@/components/paywall";
import { useIsSuperadmin } from "@/lib/use-admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  const isSuperadmin = useIsSuperadmin();
  const router = useRouter();

  useEffect(() => {
    if (isSuperadmin) {
      router.replace("/admin");
    }
  }, [isSuperadmin, router]);

  // Block render until we know the role
  if (isSuperadmin === undefined || isSuperadmin === true) return null;

  return (
    <RequireAuth>
      <PaywallWrapper>
        <DashboardLayout>{children}</DashboardLayout>
      </PaywallWrapper>
    </RequireAuth>
  );
}
