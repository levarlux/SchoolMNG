import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    "/",
    "/sign-in",
    "/sign-up",
    "/api/webhooks/clerk",
  ];
  return publicRoutes.includes(pathname);
}

const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const host = req.headers.get("host") || "";
  const parts = host.split(".");
  const subdomain = parts.length >= 3 ? parts[0] : null;

  const requestHeaders = new Headers(req.headers);
  if (subdomain && subdomain !== "www") {
    requestHeaders.set("x-school-slug", subdomain);
  }

  if (!isPublicRoute(req.nextUrl.pathname) && !isApiRoute(req)) {
    await auth.protect();
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
