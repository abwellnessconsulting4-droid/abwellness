import type { Metadata } from "next";
import {
  SITE_DESCRIPTION,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/constants";
import { getSiteMode } from "@/lib/site-mode";

export const baseURL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const meta = {
  home: {
    path: "/",
    title: `${SITE_NAME} — Coming Soon`,
    description: `${SITE_DESCRIPTION} ${SITE_TAGLINE}`,
    image: "/images/og.png",
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
  image: "/images/og.png",
};

/** Only the launched site is indexed; coming-soon is indexable, previews never are. */
export function isIndexable() {
  return getSiteMode() !== "preview";
}

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
}

/** Per-page metadata for the public site. The root layout adds the "| AB Wellness" title suffix. */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}
