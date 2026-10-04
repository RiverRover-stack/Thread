import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { accessFailure, createSession, requestAccessFailure, SESSION_SECONDS, sessionCookie, sessionCookieName, validSession } from "../lib/demo-access";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { proxy } from "../proxy";

const originalMode = process.env.NODE_ENV;
const originalPassword = process.env.THREAD_ACCESS_PASSWORD;
const password = "synthetic-login-password:only";
beforeEach(() => Object.assign(process.env, { NODE_ENV: "production", THREAD_ACCESS_PASSWORD: password }));
afterEach(() => {
  if (originalMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Object.assign(process.env, { NODE_ENV: originalMode });
  if (originalPassword === undefined) delete process.env.THREAD_ACCESS_PASSWORD;
  else process.env.THREAD_ACCESS_PASSWORD = originalPassword;
});

function cookieHeaders(token = createSession()) { return new Headers({ cookie: `${sessionCookieName()}=${token}` }); }
function loginRequest(value = password, extra: Record<string, string> = {}) {
  return new Request("https://thread.example/api/auth/login", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://thread.example", ...extra },
    body: new URLSearchParams({ password: value }),
  });
}

test("signed sessions authenticate without exposing the password and expire after eight hours", () => {
  const now = Date.now();
  const token = createSession(now);
  const headers = cookieHeaders(token);
  assert.equal(validSession(headers, now), true);
  assert.equal(accessFailure(headers), null);
  assert.ok(!token.includes(password));
  assert.equal(validSession(headers, now + SESSION_SECONDS * 1000), false);
  assert.equal(validSession(headers, now - 1000), false);
  assert.equal(accessFailure(new Headers())?.headers.get("www-authenticate"), null);
});

test("rejects forged, duplicate, malformed sessions and invalidates cookies when the password rotates", () => {
  const token = createSession();
  for (const value of ["bad", token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"), "9".repeat(10000)]) {
    assert.equal(accessFailure(cookieHeaders(value))?.status, 401);
  }
  const name = sessionCookieName();
  assert.equal(validSession(new Headers({ cookie: `${name}=${token}; ${name}=${token}` })), false);
  process.env.THREAD_ACCESS_PASSWORD = "another-synthetic-password";
  assert.equal(accessFailure(cookieHeaders(token))?.status, 401);
});

test("production cookies are host-only, HttpOnly, Secure and Strict; local cookies permit HTTP development", () => {
  const value = sessionCookie(createSession());
  assert.match(value, /^__Host-thread-session=/);
  for (const attribute of ["Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=28800", "Secure"]) assert.ok(value.includes(attribute));
  assert.ok(!value.includes("Domain="));
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.match(sessionCookie(createSession()), /^thread-session=/);
  assert.ok(!sessionCookie(createSession()).includes("Secure"));
});

test("login sets a signed session and logout clears it with uncached redirects", async () => {
  const result = await login(loginRequest());
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "/");
  assert.equal(result.headers.get("cache-control"), "no-store");
  const setCookie = result.headers.get("set-cookie")!;
  assert.ok(!setCookie.includes(password));
  const cookie = setCookie.split(";")[0];
  assert.equal(accessFailure(new Headers({ cookie })), null);
  const end = await logout(new Request("https://thread.example/api/auth/logout", { method: "POST", headers: { cookie, origin: "https://thread.example" } }));
  assert.equal(end.status, 303);
  assert.equal(end.headers.get("location"), "/login");
  assert.match(end.headers.get("set-cookie")!, /Max-Age=0/);
});

test("invalid, missing, duplicate and oversized login inputs never set a cookie; missing configuration stays closed", async () => {
  for (const request of [loginRequest("wrong-password"), loginRequest(""), loginRequest("x".repeat(5000)),
    new Request("https://thread.example/api/auth/login", { method: "POST", headers: { origin: "https://thread.example", "content-type": "application/x-www-form-urlencoded" }, body: "password=x&password=y" }),
    new Request("https://thread.example/api/auth/login", { method: "POST", headers: { origin: "https://thread.example", "content-type": "application/json" }, body: "{}" }),
  ]) {
    const result = await login(request);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get("location"), "/login?error=invalid");
    assert.equal(result.headers.get("set-cookie"), null);
  }
  delete process.env.THREAD_ACCESS_PASSWORD;
  assert.equal((await login(loginRequest())).headers.get("location"), "/login?error=unavailable");
  assert.equal(accessFailure(new Headers())?.status, 503);
});

test("login and cookie-authenticated writes reject absent, invalid, insecure and cross-site origins", async () => {
  for (const origin of ["", "null", "http://thread.example", "https://evil.example"]) {
    assert.equal((await login(loginRequest(password, { origin }))).status, 403);
    const request = new Request("https://thread.example/api/process", { method: "POST", headers: { cookie: cookieHeaders().get("cookie")!, origin } });
    assert.equal(requestAccessFailure(request)?.status, 403);
  }
  assert.equal((await login(loginRequest(password, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(requestAccessFailure(new Request("https://thread.example/api/process", { method: "POST", headers: { cookie: cookieHeaders().get("cookie")!, origin: "https://thread.example" } })), null);
});

test("login and static build assets are public while APIs and data representations stay guarded", () => {
  for (const path of ["/login", "/_next/static/chunks/app.js", "/favicon.ico"]) {
    assert.equal(proxy(new NextRequest(`https://thread.example${path}`)).headers.get("x-middleware-next"), "1");
  }
  assert.equal(proxy(new NextRequest("https://thread.example/api/auth/login", { method: "POST" })).headers.get("x-middleware-next"), "1");
  assert.equal(proxy(new NextRequest("https://thread.example/api/auth/logout", { method: "POST" })).status, 401);
  assert.equal(proxy(new NextRequest("https://thread.example/_next/data/build/thoughts.json")).status, 401);
  assert.equal(proxy(new NextRequest("https://thread.example/thoughts", { headers: cookieHeaders() })).headers.get("x-middleware-next"), "1");
});
