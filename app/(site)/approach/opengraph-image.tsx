import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Calm, clear, and built around you | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Our approach", title: "Calm, clear, and built around you" });
}
