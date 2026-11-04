import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.PIOS_STANDALONE === "true" ? "standalone" : undefined,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
