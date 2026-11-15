import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Column, Heading, Text } from "@once-ui-system/core";
import { MfaSetup } from "@/components/auth/mfa-setup";
import { requireSession } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Set up two-step verification",
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage() {
  const ctx = await requireSession({ allowMfaSetup: true });
  if (ctx.mfaVerified) redirect("/account");

  return (
    <>
      <Column gap="8">
        <Heading as="h1" variant="heading-strong-xl">
          Protect your account
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          Two-step verification is required for everyone who uses AB Wellness Consulting&apos;s secure portal. It takes about a minute.
        </Text>
      </Column>
      <MfaSetup />
    </>
  );
}
