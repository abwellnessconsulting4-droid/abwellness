import { OG_SIZE, renderOgImage } from "@/lib/og-image";

export const alt = "Terms of use | AB Wellness Consulting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({ eyebrow: "Legal", title: "Terms of use" });
}
