const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

export function validateEmail(value: unknown): string | null {
  const email = normalizeEmail(value);

  if (!email) {
    return "Please enter your email address.";
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    return "That email address is too long.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    return "Please enter a valid email address.";
  }

  return null;
}
