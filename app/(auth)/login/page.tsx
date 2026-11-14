import type { Metadata } from "next";
import { Column, Feedback, Heading, SmartLink, Text } from "@once-ui-system/core";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, { variant: "info" | "warning"; text: string }> = {
  timeout: { variant: "info", text: "You were signed out after a period of inactivity. Please sign in again." },
  expired: { variant: "info", text: "Your session expired. Please sign in again." },
  inactive: { variant: "warning", text: "This account isn't active. Contact the office for help." },
  signed_out: { variant: "info", text: "You've been signed out." },
};

/** Only allow same-site relative paths as the post-login destination. */
function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const notice = reason ? NOTICES[reason] : undefined;

  return (
    <>
      <Column gap="8">
        <Heading as="h1" variant="heading-strong-xl">
          Sign in
        </Heading>
        <Text variant="body-default-s" onBackground="neutral-medium">
          Staff and clients sign in here.
        </Text>
      </Column>
      {notice && <Feedback variant={notice.variant} description={notice.text} />}
      <LoginForm next={safeNext(params.next)} />
      <Text variant="body-default-s" onBackground="neutral-medium">
        New to AB Wellness? <SmartLink href="/request-services">Request services</SmartLink> to get started.
      </Text>
    </>
  );
}
