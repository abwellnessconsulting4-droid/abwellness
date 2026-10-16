import { NextResponse, type NextRequest } from "next/server";
import { getSiteMode } from "@/lib/site-mode";

// While the site is in coming-soon mode, every page except the home page
// redirects to "/" so unfinished pages are never reachable on the live domain.
export function proxy(request: NextRequest) {
  if (getSiteMode() === "coming-soon" && request.nextUrl.pathname !== "/") {
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
