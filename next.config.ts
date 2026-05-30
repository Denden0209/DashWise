import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Prevent build-time prerendering of API routes
  output: "standalone",
};

export default nextConfig;
