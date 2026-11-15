"use client";

import { useState } from "react";
import { Button } from "@once-ui-system/core";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      size="s"
      label="Sign out"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
        } finally {
          // Full reload clears any PHI held in client memory.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login?reason=signed_out";
        }
      }}
    />
  );
}
