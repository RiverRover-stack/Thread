import { NextResponse, type NextRequest } from "next/server";
import { requestAccessFailure, accessConfigurationFailure } from "@/lib/demo-access";
import { publicDemo, workspaceFromHeaders, createWorkspaceSession, workspaceCookie } from "@/lib/workspace";
import { getThought } from "@/lib/db/thoughts";

export async function proxy(request: NextRequest) {
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
  if (publicDemo()) {
    const configuration = accessConfigurationFailure();
    if (configuration) return configuration;
    if (!workspaceFromHeaders(request.headers) && ["GET", "HEAD"].includes(request.method) && !path.startsWith("/api/") && !path.startsWith("/_next/")) {
      const token = createWorkspaceSession();
      // Forward only our signed cookie, never a client-provided workspace header.
      const headers = new Headers(request.headers);
      const name = workspaceCookie(token).split("=")[0];
      const others = (headers.get("cookie") || "").split(";").map(v => v.trim()).filter(v => v && !v.startsWith(`${name}=`));
      headers.set("cookie", [...others, `${name}=${token}`].join("; "));
      const response = /^\/thoughts\/([^/]+)\/?$/.test(path)
        ? new NextResponse("Thought not found.", { status: 404 })
        : NextResponse.next({ request: { headers } });
      response.headers.set("Set-Cookie", workspaceCookie(token));
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
      return response;
    }
    const failure = requestAccessFailure(request);
    if (failure) return failure;
    // Check before rendering: streamed Next pages can otherwise send HTTP 200 for notFound.
    const detail = /^\/thoughts\/([^/]+)\/?$/.exec(path);
    if (detail && ["GET", "HEAD"].includes(request.method)) {
      try {
        if (!await getThought(detail[1], workspaceFromHeaders(request.headers))) {
          return new NextResponse("Thought not found.", { status: 404, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
        }
      } catch {
        return new NextResponse("Could not load this thought. Please retry.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    return response;
  }
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
