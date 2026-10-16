import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Book a time to talk | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Schedule", title: "Book a time to talk" });
}
