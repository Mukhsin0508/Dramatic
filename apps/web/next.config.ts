import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The landing page is fully static: export plain files so the site deploys
  // to any static host without serverless functions or monorepo dependency
  // tracing. GitHub stats are fetched once per build.
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
