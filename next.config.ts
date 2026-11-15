import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only badge: keep it clear of the accessibility widget (bottom-left) and back-to-top (bottom-right).
  devIndicators: { position: "top-left" },
  experimental: {
    // forbidden() for real 403 responses when RBAC denies access (Use Case 6).
    authInterrupts: true,
    // Document uploads (4 MB max, encrypted server-side) plus multipart overhead; Vercel caps bodies at ~4.5 MB.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default nextConfig;
