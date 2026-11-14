import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // forbidden() for real 403 responses when RBAC denies access (Use Case 6).
    authInterrupts: true,
  },
  sassOptions: {
    compiler: "modern",
    silenceDeprecations: ["legacy-js-api"],
  },
};

export default nextConfig;
