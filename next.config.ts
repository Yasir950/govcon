import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project — otherwise Next.js walks up
    // to D:\ (which has its own unrelated lockfile) and picks up configs
    // from whatever else lives at the drive root.
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      // Next.js's server-action default (1MB) rejected any real cover/
      // avatar photo above that size with a 413 before the handler's own
      // 5MB validation ever ran — a real phone photo routinely exceeds 1MB.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
