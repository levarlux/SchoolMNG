import type { Metadata } from "next";
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
    <ClerkProviderWithRouter>
      <html lang="en">
        <body className="bg-background text-foreground antialiased">
          <ConvexClientProvider>
            <SchoolThemeProvider>
              {children}
            </SchoolThemeProvider>
          </ConvexClientProvider>
          <Toaster richColors />
        </body>
      </html>
    </ClerkProviderWithRouter>
  );
}
