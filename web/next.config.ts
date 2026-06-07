import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared contract is a workspace TS package compiled on the fly.
  transpilePackages: ["@voicebridge/contracts"],
  reactStrictMode: true,
};

export default nextConfig;
