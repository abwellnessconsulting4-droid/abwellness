"use client";

import { Input, PasswordInput } from "@once-ui-system/core";
import { PreviewForm } from "@/components/forms/preview-form";

export function LoginForm() {
  return (
    <PreviewForm submitLabel="Sign in" successTitle="Client portal coming soon">
      <Input id="login-email" name="email" type="email" label="Email" autoComplete="username" required />
      <PasswordInput id="login-password" name="password" label="Password" autoComplete="current-password" required />
    </PreviewForm>
  );
}
