import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  basePath: "/admin",
  assetPrefix: "/admin",
  trailingSlash: true,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
