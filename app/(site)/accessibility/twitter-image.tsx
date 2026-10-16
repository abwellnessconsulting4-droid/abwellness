import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Accessibility statement | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Legal", title: "Accessibility statement" });
}
