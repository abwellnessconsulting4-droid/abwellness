import type { Metadata } from "next";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/constants";
import { getSiteMode } from "@/lib/site-mode";

function resolveBaseURL() {
  // Preview deployments describe themselves, so shared preview links get working cards.
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const baseURL = resolveBaseURL();

export const meta = {
  home: {
    path: "/",
    title:
      getSiteMode() === "coming-soon"
        ? `${SITE_NAME} — Coming Soon`
        : `${SITE_NAME} | ${SITE_TAGLINE}`,
    description: `${SITE_DESCRIPTION} ${SITE_TAGLINE}`,
    image: "/images/og.png",
    canonical: baseURL,
    robots: "index,follow",
  },
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
