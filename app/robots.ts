import type { MetadataRoute } from "next";
import { baseURL, isIndexable } from "@/resources/seo";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/login"] },
    sitemap: `${baseURL}/sitemap.xml`,
  };
}
