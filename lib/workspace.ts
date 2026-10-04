import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type CookieHeaders = Pick<Headers, "get">;
export const WORKSPACE_SECONDS = 30 * 24 * 60 * 60;
export function publicDemo() { return process.env.THREAD_ACCESS_MODE === "public-demo"; }
export function workspaceConfigurationValid() {
  return (process.env.THREAD_SESSION_SECRET?.length ?? 0) >= 32;
}
export function workspaceCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-thread-workspace" : "thread-workspace";
}
function sign(payload: string) {
  return createHmac("sha256", process.env.THREAD_SESSION_SECRET || "").update(`thread-workspace:v1:${payload}`).digest("base64url");
}
export function createWorkspaceSession(now = Date.now()) {
  if (!workspaceConfigurationValid()) throw new Error("Workspace secret is not configured");
  const payload = `${Math.floor(now / 1000) + WORKSPACE_SECONDS}.${randomBytes(24).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}
export function workspaceFromHeaders(headers: CookieHeaders, now = Date.now()): string | null {
  if (!workspaceConfigurationValid()) return null;
  const cookie = headers.get("cookie") || "";
  if (cookie.length > 8192) return null;
  const entries = cookie.split(";").map(v => v.trim()).filter(v => v.startsWith(`${workspaceCookieName()}=`));
  if (entries.length !== 1) return null;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/.exec(entries[0].slice(workspaceCookieName().length + 1));
  if (!match) return null;
  const seconds = Math.floor(now / 1000);
  if (Number(match[1]) <= seconds || Number(match[1]) > seconds + WORKSPACE_SECONDS) return null;
  if (!timingSafeEqual(Buffer.from(match[3]), Buffer.from(sign(`${match[1]}.${match[2]}`)))) return null;
  return match[2];
}
export function workspaceCookie(token: string) {
  return `${workspaceCookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${WORKSPACE_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function requestWorkspace(headers: CookieHeaders): string | null {
  if (!publicDemo()) return null;
  const workspace = workspaceFromHeaders(headers);
  if (!workspace) throw new Error("A valid visitor workspace is required");
  return workspace;
}
// All storage operations call this even if an entry point forgets to pass scope.
export function requireWorkspaceScope(workspace: string | null) {
  if (publicDemo() && !workspace) throw new Error("Public operations require workspace ownership");
  return workspace;
}
