import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @duke/* packages ship compiled JS, so nothing needs transpiling.
};

export default nextConfig;
