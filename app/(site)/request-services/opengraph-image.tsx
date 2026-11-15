import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Let’s find the right support together | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Request services", title: "Let’s find the right support together" });
}
