import Script from "next/script";

/**
 * Sienna accessibility toolbar (MIT, https://github.com/bennyluk/Sienna-Accessibility-Widget):
 * text size, contrast, dyslexia-friendly font, reading guide, stop animations.
 *
 * Public site only (never the portal or dashboard, where PHI is shown).
 * Pinned to an exact version with Subresource Integrity, so a changed file is
 * refused by the browser. To upgrade: bump the version and recompute the hash
 * (openssl dgst -sha384 -binary file.js | openssl base64 -A).
 *
 * It follows <html lang> (English/Spanish) and saves the visitor's settings in
 * their own browser. It complements, but doesn't replace, accessible markup.
 */
const VERSION = "2.2.333";
const INTEGRITY = "sha384-0KH2WYpIKGviyNd2L73jN0B5O/d6vMdncUyRe/ZuE1f9wLaExDOAJE6OH5TQRtOQ";

export function AccessibilityWidget() {
  return (
    <Script
      id="sienna-accessibility"
      src={`https://cdn.jsdelivr.net/npm/sienna-accessibility@${VERSION}/dist/sienna-accessibility.umd.js`}
      integrity={INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      data-asw-position="bottom-left"
    />
  );
}
