import type { NextConfig } from "next";

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
