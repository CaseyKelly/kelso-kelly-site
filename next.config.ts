import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Keep sharp out of the Turbopack/webpack bundle so its native libvips
  // binary is resolved normally from node_modules at runtime instead of
  // being traced/bundled (which breaks native binding loading on Vercel).
  // heic-convert is kept external too so its libheif WebAssembly build
  // loads from node_modules as-is rather than through the bundler.
  serverExternalPackages: ["sharp", "heic-convert"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "caseykelly",
  project: "sentry-casey-kelly",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to avoid ad-blockers.
  tunnelRoute: "/monitoring",
});
