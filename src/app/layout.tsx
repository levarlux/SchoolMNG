import type { Metadata } from "next";
import { Suspense } from "react";
import { ClerkProviderWithRouter } from "@/components/clerk-provider-with-router";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SchoolThemeProvider } from "@/components/school-theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "School Library Manager",
  description: "Library management system for schools",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <ClerkProviderWithRouter>
          <ConvexClientProvider>
            <SchoolThemeProvider>
              <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a", color: "#888", fontFamily: "system-ui, sans-serif" }}>Loading…</div>}>
                {children}
              </Suspense>
            </SchoolThemeProvider>
          </ConvexClientProvider>
          <Toaster richColors />
        </ClerkProviderWithRouter>
      </body>
    </html>
  );
}
