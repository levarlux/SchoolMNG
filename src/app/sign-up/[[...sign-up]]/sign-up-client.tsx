"use client";

import { SignUp } from "@clerk/clerk-react";

export function SignUpClient() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
