import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
import { Suspense } from "react";
import { ClerkProviderWithRouter } from "@/components/clerk-provider-with-router";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { SchoolThemeProvider } from "@/components/school-theme-provider";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Toaster } from "sonner";
import "./globals.css";
import "@sentry/nextjs";

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
      <body className={`bg-background text-foreground antialiased ${inter.variable} font-sans`}>
        <Suspense fallback={<BrandLoader variant="full" size="lg" />}>
          <ClerkProviderWithRouter>
            <ConvexClientProvider>
              <SchoolThemeProvider>
                {children}
              </SchoolThemeProvider>
            </ConvexClientProvider>
            <Toaster richColors />
          </ClerkProviderWithRouter>
        </Suspense>
      </body>
    </html>
  );
}
