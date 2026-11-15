import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Structured programs for focused goals | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Programs", title: "Structured programs for focused goals" });
}
