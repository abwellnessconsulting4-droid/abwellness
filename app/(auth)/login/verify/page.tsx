import type { Metadata } from "next";
import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { TwoFactorVerify } from "@/components/auth/two-factor-verify";

export const metadata: Metadata = {
  title: "Verify sign-in",
  robots: { index: false, follow: false },
};

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const params = await searchParams;
  return (
    <>
      <Column gap="8">
        <Heading as="h1" variant="heading-strong-xl">
          Two-step verification
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          One more step to protect your health information.
        </Text>
      </Column>
      <TwoFactorVerify next={safeNext(params.next)} />
      <Text variant="body-default-s" onBackground="neutral-medium">
        <SmartLink href="/login">Start over</SmartLink>
      </Text>
    </>
  );
}
