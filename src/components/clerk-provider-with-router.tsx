"use client";

import React, { Suspense, use, ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";
import { isTauri } from "@tauri-apps/api/core";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const clerkPromise = (async () => {
  if (isTauri()) {
    const { initClerk } = await import("tauri-plugin-clerk");
    return initClerk();
  }
  return null;
})();

function AuthProviderInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clerk = use(clerkPromise);

  return (
    <ClerkProvider
      publishableKey={clerk?.publishableKey ?? publishableKey}
      {...(clerk ? { Clerk: clerk as any } : {})}
      routerPush={(to) => router.push(to)}
      routerReplace={(to) => router.replace(to)}
    >
      {children}
    </ClerkProvider>
  );
}

export function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div style={{ background: "#fff", height: "100vh" }}>Loading Authenticator...</div>}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </Suspense>
  );
}
