import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "AB Wellness",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#001428",
    theme_color: "#001428",
    icons: [{ src: "/images/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
