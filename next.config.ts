import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "postgres"],
  poweredByHeader: false,
};

export default nextConfig;
