import { NextResponse, type NextRequest } from "next/server";
import { requestAccessFailure } from "@/lib/demo-access";

export function proxy(request: NextRequest) {
  // Only the exact liveness endpoint is public; no blanket API or file exemptions.
  if (request.nextUrl.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) {
    return NextResponse.next();
  }
  return requestAccessFailure(request) || NextResponse.next();
}

export const config = { matcher: "/:path*" };
