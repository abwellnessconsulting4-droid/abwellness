import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Questions, answered | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "FAQ", title: "Questions, answered" });
}
