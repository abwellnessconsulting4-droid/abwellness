import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Support for people and the organizations that serve them | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Services", title: "Support for people and the organizations that serve them" });
}
