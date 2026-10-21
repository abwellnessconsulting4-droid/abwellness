import type { SocialLink } from "@/types";

export const SITE_NAME = "AB Wellness Consulting";
export const SITE_LEGAL_NAME = "AB Wellness Consulting Inc.";
export const SITE_TAGLINE = "Solutions for growth. Support for life.";
export const SITE_DESCRIPTION =
  "Bilingual (English and Spanish) social services consulting: housing stabilization, resource navigation, and skill-building for individuals and families, plus staff training and program consultation for organizations. Led by Angelica Berrios, MSW.";
export const CONTACT_EMAIL = "hello@abwellnessconsulting.com";

/** Launch date: December 1, 2026, 9:00 AM Eastern (EST, UTC-5). */
export const LAUNCH_DATE_ISO = "2026-12-01T09:00:00-05:00";

export const SOCIAL_LINKS: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/abwellnessconsulting",
    icon: "instagram",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/ab-wellness-consulting",
    icon: "linkedin",
  },
  {
    label: "Facebook",
    href: "https://facebook.com/abwellnessconsulting",
    icon: "facebook",
  },
  {
    label: "Email",
    href: `mailto:${CONTACT_EMAIL}`,
    icon: "mail",
  },
];
