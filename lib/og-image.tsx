import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

/**
 * Branded 1200×630 social card shared by every page's opengraph-image / twitter-image.
 * Rendered at build time (pages are static), so the font and logo are read from disk.
 */
export const OG_SIZE = { width: 1200, height: 630 };

const NAVY = "#001428";
const NAVY_LIGHT = "#0b2a4a";
const GOLD = "#d4af37";
const GOLD_SOFT = "#e8c97a";

export async function renderOgImage({ eyebrow, title }: { eyebrow: string; title: string }) {
  const [heading, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/CormorantGaramond-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/og/logo-220.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `radial-gradient(circle at 85% 0%, ${NAVY_LIGHT} 0%, ${NAVY} 60%)`,
          color: "#f5f7fa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse needs a plain img */}
          <img src={logoSrc} width={96} height={96} style={{ borderRadius: 16 }} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Cormorant", fontSize: 40, color: GOLD_SOFT }}>{SITE_NAME}</div>
            <div style={{ fontSize: 22, color: "#9fb3c8" }}>{SITE_TAGLINE}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: GOLD }}>{eyebrow}</div>
          <div style={{ fontFamily: "Cormorant", fontSize: 76, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 120, height: 3, background: GOLD }} />
          <div style={{ fontSize: 24, color: "#9fb3c8" }}>abwellnessconsulting.com</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Cormorant", data: heading, style: "normal", weight: 600 }],
    },
  );
}
