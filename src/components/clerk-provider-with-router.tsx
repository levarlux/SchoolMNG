"use client";

import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";

export function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  const router = useRouter();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      routerPush={(to) => router.push(to)}
      routerReplace={(to) => router.replace(to)}
    >
      {children}
    </ClerkProvider>
  );
}
