import type { Metadata } from "next";
import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <>
      <Column gap="8">
        <Heading as="h1" variant="heading-strong-xl">
          Reset your password
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          Enter the email you sign in with and we&apos;ll send you a reset link.
        </Text>
      </Column>
      <ForgotPasswordForm />
      <Text variant="body-default-s">
        <SmartLink href="/login">Back to sign in</SmartLink>
      </Text>
    </>
  );
}
