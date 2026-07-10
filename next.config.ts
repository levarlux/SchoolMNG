import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "levarlux.com" },
      { protocol: "https", hostname: "*.levarlux.com" },
    ],
  },
};

export default nextConfig;
