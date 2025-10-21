import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

const publicRoutes = ["/api/live-feed"];

export default clerkMiddleware(async (auth, req) => {
  const url = new URL(req.url);
  if (publicRoutes.includes(url.pathname)) {
    return NextResponse.next();
  }

  const authResult = await auth();
  if (!authResult.userId) {
    return authResult.redirectToSignIn({ returnBackUrl: req.url });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
