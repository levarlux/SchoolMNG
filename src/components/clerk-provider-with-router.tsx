"use client";

import { ReactNode, useState, useEffect } from "react";
import { ClerkProvider } from "@clerk/clerk-react";
import { useRouter } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [clerk, setClerk] = useState<any>(null);

  useEffect(() => {
    import("tauri-plugin-clerk")
      .then((mod) => mod.initClerk())
      .then(setClerk)
      .catch(console.error);
  }, []);

  return (
    <ClerkProvider
      publishableKey={clerk?.publishableKey ?? publishableKey}
      {...(clerk ? { Clerk: clerk } : {})}
      routerPush={(to) => router.push(to)}
      routerReplace={(to) => router.replace(to)}
    >
      {children}
    </ClerkProvider>
  );
}
