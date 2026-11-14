import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { getSiteMode } from "@/lib/site-mode";

/** Signed-in app areas (staff dashboard, patient portal, account security). */
const APP_PREFIXES = ["/dashboard", "/portal", "/account"];
/** Reachable in every site mode so staff and patients can sign in before launch. */
const AUTH_PAGES = ["/login", "/forgot-password", "/reset-password"];

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (matches(pathname, APP_PREFIXES)) {
    // Optimistic check only (cookie present). lib/dal.ts validates the session,
    // role, MFA, and timeouts against the database on every request.
    if (!getSessionCookie(request, { cookiePrefix: "abw" })) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
    const response = NextResponse.next();
    // Pages with PHI must never be cached by browsers or CDNs, or framed.
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // While the site is in coming-soon mode, every public page except the home
  // page redirects to "/" so unfinished pages are never reachable on the live domain.
  if (getSiteMode() === "coming-soon" && pathname !== "/" && !matches(pathname, AUTH_PAGES)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Pages only: skip API routes, Next internals, metadata files, and anything with a file extension.
  matcher: [
    "/((?!api|_next/static|_next/image|robots.txt|sitemap.xml|manifest.webmanifest|.*opengraph-image|.*twitter-image|.*\\..*).*)",
  ],
};
