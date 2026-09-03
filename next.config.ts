import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Deliverable uploads arrive through a Server Action, so they are bounded by
    // whatever the host allows in a request body. Vercel rejects anything over
    // 4.5 MB at the platform edge before the action runs, so configuring more
    // here would only turn a clear error into a confusing 413. Self-hosted
    // deployments can raise both this and NEXT_PUBLIC_MAX_UPLOAD_MB together.
    serverActions: { bodySizeLimit: (process.env.MAX_UPLOAD_BODY_SIZE ?? "4mb") as `${number}mb` },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
