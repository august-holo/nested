import type { NextConfig } from "next";

// Production is a static export served from S3; CloudFront routes /api/* to the backend.
// In development the dev server proxies /api/* to a locally running backend instead.
const nextConfig: NextConfig =
  process.env.NODE_ENV === "development"
    ? {
        rewrites: async () => [
          { source: "/api/:path*", destination: "http://127.0.0.1:8080/api/:path*" },
        ],
      }
    : { output: "export" };

export default nextConfig;
