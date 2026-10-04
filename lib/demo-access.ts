import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

type RequestHeaders = Pick<Headers, "get">;

function denied(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Authorization",
      ...(status === 401 ? { "WWW-Authenticate": 'Basic realm="Thread", charset="UTF-8"' } : {}),
    },
  });
}

export function accessFailure(headers: RequestHeaders): Response | null {
  const password = process.env.THREAD_ACCESS_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? denied("Thread access is not configured. Set the server access password.", 503)
      : null;
  }
  if (password.length < 16 || password.length > 256) {
    return denied("Configure a Thread access password between 16 and 256 characters.", 503);
  }
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
  // Hashes have equal lengths, so comparison does not branch on password length.
  const supplied = createHash("sha256").update(credentials).digest();
  const expected = createHash("sha256").update(`thread:${password}`).digest();
  return timingSafeEqual(supplied, expected) ? null : denied("Sign in to Thread.", 401);
}

export function requestAccessFailure(request: Request): Response | null {
  const failure = accessFailure(request.headers);
  if (failure) return failure;
  // A browser may automatically attach Basic credentials; reject cross-site writes.
  if (process.env.THREAD_ACCESS_PASSWORD && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return denied("Use Thread from its own site to submit requests.", 403);
    }
    const origin = request.headers.get("origin");
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
