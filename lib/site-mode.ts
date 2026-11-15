/**
 * Which version of the public site this deployment serves.
 *
 * - "coming-soon": only the countdown + waitlist page; every other page redirects to "/".
 * - "preview":     the full site with a "Preview" banner, not indexed by search engines.
 * - "live":        the full site, indexed. Set SITE_MODE=live in production at launch.
 *
 * Without SITE_MODE, production builds (except Vercel preview deployments) default to
 * "coming-soon", and everything else (local dev, preview links) defaults to "preview".
 */
export type SiteMode = "coming-soon" | "preview" | "live";

const MODES: readonly SiteMode[] = ["coming-soon", "preview", "live"];

export function getSiteMode(): SiteMode {
  const configured = process.env.SITE_MODE as SiteMode | undefined;
  if (configured && MODES.includes(configured)) {
    return configured;
  }

  const isProductionDeployment =
    process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";

  return isProductionDeployment ? "coming-soon" : "preview";
}
