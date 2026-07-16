"use client";

import { SignIn } from "@clerk/clerk-react";

export function SignInClient() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
