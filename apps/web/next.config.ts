import type { NextConfig } from "next";

/**
 * The browser only ever talks to `/api` on its own origin.
 *
 * In development this rewrite forwards that to the API on port 3001; in production Caddy does
 * the same thing before Next sees the request. The effect is that the app has no API base URL
 * to configure and no cross-origin request to get wrong — and the address of the API stays a
 * server-side fact instead of something baked into the browser bundle.
 *
 * `API_ORIGIN` is deliberately not `NEXT_PUBLIC_`: it is read by the Next server, not the phone.
 */
const API_ORIGIN = process.env["API_ORIGIN"] ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @duke/* packages ship compiled JS, so nothing needs transpiling.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
