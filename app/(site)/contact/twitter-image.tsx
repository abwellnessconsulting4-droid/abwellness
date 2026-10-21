import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "We’d love to hear from you | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Contact", title: "We’d love to hear from you" });
}
