import {
  SITE_DESCRIPTION,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/constants";

export const baseURL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const meta = {
  home: {
    path: "/",
    title: `${SITE_NAME} — Coming Soon`,
    description: `${SITE_DESCRIPTION} ${SITE_TAGLINE}`,
    image: "/images/logo_ab.png",
    canonical: baseURL,
    robots: "index,follow",
  },
};

export const schema = {
  as: "organization" as const,
  title: SITE_LEGAL_NAME,
  description: meta.home.description,
  baseURL,
  path: "/",
  image: "/images/logo_ab.png",
};
