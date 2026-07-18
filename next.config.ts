import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force static export so Tauri can read the HTML/CSS/JS files directly
  output: "export", 
  transpilePackages: ["@clerk/clerk-react", "@clerk/shared", "tauri-plugin-clerk"],
  images: {
    unoptimized: true, // Required for static export as Next.js image optimization requires a Node server
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "levarlux.com" },
      { protocol: "https", hostname: "*.levarlux.com" },
    ],
  },
};

export default nextConfig;