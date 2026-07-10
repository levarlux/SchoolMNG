"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";
import Link from "next/link";
import { useIsSuperadmin } from "@/lib/use-admin";

export default function Home() {
  const { userId, isLoaded } = useAuth();
  const { isLoading: authLoading } = useConvexAuth();
  const isSuperadmin = useIsSuperadmin();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || authLoading || isSuperadmin === undefined) return;
    if (isSuperadmin) {
      router.replace("/admin");
    }
  }, [isSuperadmin, isLoaded, authLoading, router]);

  if (isSuperadmin) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="rounded-2xl bg-primary p-4">
          <Library className="h-12 w-12 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">School Library Manager</h1>
        <p className="text-muted-foreground text-lg">
          Manage book borrowing across your school. Track who has what, when it&apos;s due, and never lose a book again.
        </p>
        {!userId ? (
          <SignInButton mode="modal">
            <Button size="lg" className="w-full">Sign In to Get Started</Button>
          </SignInButton>
        ) : (
          <Link href="/dashboard">
            <Button size="lg">Go to Dashboard</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
