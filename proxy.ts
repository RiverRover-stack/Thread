import { NextResponse, type NextRequest } from "next/server";
import { requestAccessFailure } from "@/lib/demo-access";

export function proxy(request: NextRequest) {
  const path = new URL(request.url).pathname;
  // Only the exact liveness endpoint is public; no blanket API or file exemptions.
  if (path === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
    return NextResponse.next();
  }
  // Public login and immutable build assets contain no thought data.
  if ((path === "/login" && ["GET", "HEAD"].includes(request.method))
    || (path === "/api/auth/login" && request.method === "POST")
    || (path.startsWith("/_next/static/") && ["GET", "HEAD"].includes(request.method))
    || (path === "/favicon.ico" && ["GET", "HEAD"].includes(request.method))) return NextResponse.next();
  const failure = requestAccessFailure(request);
  if (failure?.status === 401 && ["GET", "HEAD"].includes(request.method)
    && !path.startsWith("/api/") && !path.startsWith("/_next/")) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return failure || NextResponse.next();
}

export const config = { matcher: "/:path*" };
