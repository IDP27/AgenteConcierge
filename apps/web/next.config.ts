import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O shared é publicado como TS puro (internal package) — o Next transpila.
  transpilePackages: ["@concierge/shared"],
};

export default nextConfig;
