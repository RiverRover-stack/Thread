import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type RequestHeaders = Pick<Headers, "get">;

function denied(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Cookie, Authorization",
    },
  });
}

export function accessConfigurationFailure(): Response | null {
  const password = process.env.THREAD_ACCESS_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? denied("Thread access is not configured. Set the server access password.", 503)
      : null;
  }
  if (password.length < 16 || password.length > 256) {
    return denied("Configure a Thread access password between 16 and 256 characters.", 503);
  }
  return null;
}

export function passwordMatches(value: string): boolean {
  const password = process.env.THREAD_ACCESS_PASSWORD;
  if (!password || accessConfigurationFailure()) return false;
  const supplied = createHash("sha256").update(value).digest();
  const expected = createHash("sha256").update(password).digest();
  return timingSafeEqual(supplied, expected);
}

export const SESSION_SECONDS = 8 * 60 * 60;
export function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-thread-session" : "thread-session";
}

function signature(payload: string) {
  return createHmac("sha256", process.env.THREAD_ACCESS_PASSWORD || "")
    .update(`thread-session:v1:${payload}`).digest("base64url");
}

export function createSession(now = Date.now()): string {
  if (!process.env.THREAD_ACCESS_PASSWORD || accessConfigurationFailure()) throw new Error("Access is not configured");
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${signature(payload)}`;
}

export function validSession(headers: RequestHeaders, now = Date.now()): boolean {
  const cookie = headers.get("cookie") || "";
  if (cookie.length > 8192 || !process.env.THREAD_ACCESS_PASSWORD || accessConfigurationFailure()) return false;
  const entries = cookie.split(";").map(value => value.trim())
    .filter(value => value.startsWith(`${sessionCookieName()}=`));
  if (entries.length !== 1) return false;
  const token = entries[0].slice(sessionCookieName().length + 1);
  const match = /^(\d{10})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (expiry <= seconds || expiry > seconds + SESSION_SECONDS) return false;
  const expected = Buffer.from(signature(`${match[1]}.${match[2]}`));
  return timingSafeEqual(Buffer.from(match[3]), expected);
}

export function sessionCookie(token: string, clear = false): string {
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function accessFailure(headers: RequestHeaders): Response | null {
  const configuration = accessConfigurationFailure();
  if (configuration) return configuration;
  if (!process.env.THREAD_ACCESS_PASSWORD || validSession(headers)) return null;
  // Browsers must use cookies: old cached Basic credentials must not undo logout.
  if (headers.get("sec-fetch-mode")) return denied("Sign in to Thread.", 401);
  // Keep explicit Basic headers for CLI checks, without triggering browser prompts.
  const authorization = headers.get("authorization") || "";
  if (authorization.length > 4096) return denied("Sign in to Thread.", 401);
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match || match[1].length % 4 !== 0) return denied("Sign in to Thread.", 401);
  let credentials: string;
  try {
    credentials = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(match[1], "base64"));
  } catch {
    return denied("Sign in to Thread.", 401);
  }
  return credentials.startsWith("thread:") && passwordMatches(credentials.slice(7)) ? null : denied("Sign in to Thread.", 401);
}

export function crossSiteFailure(request: Request, requireOrigin = false): Response | null {
  if (process.env.THREAD_ACCESS_PASSWORD && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return denied("Use Thread from its own site to submit requests.", 403);
    }
    const origin = request.headers.get("origin");
    if (!origin && requireOrigin) return denied("Use Thread from its own site to submit requests.", 403);
    if (origin) {
      try {
        const parsed = new URL(origin);
        const host = request.headers.get("host") || new URL(request.url).host;
        if (parsed.host !== host || !["http:", "https:"].includes(parsed.protocol)
          || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")) {
          return denied("Use Thread from its own site to submit requests.", 403);
        }
      } catch {
        return denied("Use Thread from its own site to submit requests.", 403);
      }
    }
  }
  return null;
}

export function requestAccessFailure(request: Request): Response | null {
  return accessFailure(request.headers) || crossSiteFailure(request, validSession(request.headers));
}
