import type { NextConfig } from "next";

const config: NextConfig = {
  // The docs pages have no dynamic data, so Next renders them at build time. That gives the
  // RSC payload `router.prefetch` warms, which is the point of the demo.
  experimental: { optimizePackageImports: [] },
};

export default config;
