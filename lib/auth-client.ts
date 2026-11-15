"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Keep ?next= so the user lands where they were going after the code step.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- no router here; full load starts the verify step clean
        window.location.href = `/login/verify${window.location.search}`;
      },
    }),
  ],
});
