import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SchoolThemeProvider } from "@/components/school-theme-provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
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
    <ClerkProvider>
      <html lang="en">
        <body className="bg-background text-foreground antialiased">
          <ConvexClientProvider>
            <SchoolThemeProvider>
              {children}
            </SchoolThemeProvider>
          </ConvexClientProvider>
          <Toaster richColors />
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
