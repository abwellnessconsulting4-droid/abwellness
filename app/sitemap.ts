import type { MetadataRoute } from "next";
import { getSiteMode } from "@/lib/site-mode";
import { baseURL } from "@/resources/seo";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/founder",
  "/services",
  "/approach",
  "/programs",
  "/resources",
  "/faq",
  "/contact",
  "/request-services",
  "/schedule",
  "/privacy",
  "/terms",
  "/accessibility",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = getSiteMode() === "coming-soon" ? ["/"] : PUBLIC_PATHS;

  return paths.map((path) => ({
    url: `${baseURL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
