import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Helpful tools and trusted connections | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Resources", title: "Helpful tools and trusted connections" });
}
