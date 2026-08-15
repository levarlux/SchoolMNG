import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Force static export so Tauri can read the HTML/CSS/JS files directly
  output: "export", 
  transpilePackages: ["@clerk/clerk-react", "@clerk/shared", "tauri-plugin-clerk"],
  // Pin the Turbopack project root to this directory. Without it, Turbopack
  // scans parent directories for a lockfile to infer the workspace root; a
  // stray package-lock.json in the user home folder made it resolve modules
  // from the wrong root, so `@tailwindcss/postcss` couldn't be found and the
  // PostCSS loader timed out (Turbopack panic on globals.css).
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true, // Required for static export as Next.js image optimization requires a Node server
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "levarlux.com" },
      { protocol: "https", hostname: "*.levarlux.com" },
    ],
  },
};

// withSentryConfig is a Webpack plugin and crashes Turbopack (used by `next dev`).
// Apply it ONLY for production builds, which use Webpack. Dev mode keeps Turbopack
// clean; Sentry client-side init still runs from sentry.client.config.ts.
//
// Source map upload needs SENTRY_ORG + SENTRY_PROJECT + SENTRY_AUTH_TOKEN in the
// build env (see docs/PUSH-CHECKLIST.md). If they're missing we still run the
// plugin (treeshaking + instrumentation) but skip upload and never fail the
// build — errorHandler downgrades upload errors to warnings.
// NOTE: if you ever build with `next build --turbopack`, this plugin will run
// against Turbopack too. Keep using plain `next build` (Webpack) in CI/release
// scripts — the build script and release.yml both use Webpack today.
const isProductionBuild = process.env.NODE_ENV === "production";
const sentryKeysConfigured = Boolean(
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN
);

export default isProductionBuild
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true, // Don't print debug logs from the build plugin
      widenClientFileUpload: true,
      sourcemaps: {
        disable: !sentryKeysConfigured || process.env.SENTRY_SOURCEMAPS_DISABLED === "true",
      },
      errorHandler: (err) => {
        console.warn("[Sentry] Source map upload failed (non-fatal):", err.message);
      },
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : nextConfig;