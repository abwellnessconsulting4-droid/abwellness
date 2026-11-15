import type { Metadata } from "next";
import { Column, Feedback, Heading, SmartLink, Text } from "@once-ui-system/core";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Set your password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;
  const invite = params.invite === "1";

  return (
    <>
      <Column gap="8">
        <Heading as="h1" variant="heading-strong-xl">
          {invite ? "Welcome to AB Wellness" : "Choose a new password"}
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          {invite ? "Create a password to finish setting up your account. Next, you'll set up two-step verification." : "Your new password replaces the old one and signs you out of other devices."}
        </Text>
      </Column>
      {token && !params.error ? (
        <ResetPasswordForm token={token} invite={invite} />
      ) : (
        <Feedback variant="warning" description="This link has expired or isn't valid. Request a new one below or ask your administrator to resend your invitation." />
      )}
      <Text variant="body-default-s">
        <SmartLink href="/forgot-password">Request a new link</SmartLink> · <SmartLink href="/login">Sign in</SmartLink>
      </Text>
    </>
  );
}
