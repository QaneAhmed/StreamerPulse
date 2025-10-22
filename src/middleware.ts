import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { resolveSiteUrl } from "@/lib/site-url";

const publicRoutes = ["/api/live-feed"];

export default clerkMiddleware(async (auth, req) => {
  const url = new URL(req.url);
  if (publicRoutes.includes(url.pathname)) {
    return NextResponse.next();
  }

  if (
    url.pathname.startsWith("/sign-in") ||
    url.pathname.startsWith("/sign-up") ||
    url.searchParams.has("__clerk_db_jwt") ||
    url.searchParams.has("__clerk_redirect_url")
  ) {
    return NextResponse.next();
  }

  const authResult = await auth();
  if (!authResult.userId) {
    const siteUrl = resolveSiteUrl({ headers: req.headers, nextUrlOrigin: req.nextUrl.origin });
    const redirectPath = `${url.pathname}${url.search}`;
    const redirectParam = encodeURIComponent(redirectPath);
    const destination = `${siteUrl}/sign-in?redirect_url=${redirectParam}`;
    return NextResponse.redirect(destination);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
