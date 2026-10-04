import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { accessFailure, createSession, requestAccessFailure, sessionCookieName } from "../lib/demo-access";
import { proxy } from "../proxy";
import { POST as processThought } from "../app/api/process/route";
import { POST as transcribe } from "../app/api/transcribe/route";
import { POST as save } from "../app/api/thoughts/route";
import { POST as index } from "../app/api/thoughts/[id]/embedding/route";
import { POST as connect } from "../app/api/thoughts/[id]/connection/route";
import { GET as related } from "../app/api/thoughts/[id]/related/route";

const originalMode = process.env.NODE_ENV;
const originalPassword = process.env.THREAD_ACCESS_PASSWORD;
const originalFetch = globalThis.fetch;
const password = "synthetic-test-password:only";
const authorization = `Basic ${Buffer.from(`thread:${password}`).toString("base64")}`;
const parameters = { params: Promise.resolve({ id: "bf375e93-6ff1-4cba-bcf1-574465e949ea" }) };

beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "production", THREAD_ACCESS_PASSWORD: password });
  globalThis.fetch = async () => { throw new Error("Unauthorized requests must not call providers"); };
});

afterEach(() => {
  if (originalMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Object.assign(process.env, { NODE_ENV: originalMode });
  if (originalPassword === undefined) delete process.env.THREAD_ACCESS_PASSWORD;
  else process.env.THREAD_ACCESS_PASSWORD = originalPassword;
  globalThis.fetch = originalFetch;
});

test("production fails closed without a usable password; development remains accessible by default", () => {
  delete process.env.THREAD_ACCESS_PASSWORD;
  assert.equal(accessFailure(new Headers())?.status, 503);
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.equal(accessFailure(new Headers()), null);
  process.env.THREAD_ACCESS_PASSWORD = "short";
  assert.equal(accessFailure(new Headers())?.status, 503);
  process.env.THREAD_ACCESS_PASSWORD = "x".repeat(257);
  assert.equal(accessFailure(new Headers())?.status, 503);
});

test("validates username and password, rejects malformed credentials and does not disclose the password", async () => {
  assert.equal(accessFailure(new Headers({ authorization })), null);
  for (const value of ["", "Bearer token", "Basic !!!!", "Basic YQ", "Basic " + "A".repeat(5000),
    `Basic ${Buffer.from("other:" + password).toString("base64")}`,
    `Basic ${Buffer.from("thread:wrong-password").toString("base64")}`,
    "Basic /w==",
  ]) {
    const failure = accessFailure(new Headers({ authorization: value }));
    assert.equal(failure?.status, 401);
    assert.equal(failure?.headers.get("cache-control"), "no-store");
    assert.equal(failure?.headers.get("www-authenticate"), null);
    assert.ok(!(await failure?.text())?.includes(password));
  }
});

test("exact health bypasses the gate; protected pages redirect and APIs/data representations reject access", () => {
  for (const method of ["GET", "HEAD"]) {
    assert.equal(proxy(new NextRequest("https://thread.example/api/health", { method })).headers.get("x-middleware-next"), "1");
  }
  for (const path of ["/api/process", "/api/health/extra", "/_next/data/build/thoughts.json"]) {
    assert.equal(proxy(new NextRequest(`https://thread.example${path}`)).status, 401);
  }
  for (const path of ["/", "/thoughts", "/thoughts/id", "/thoughts/id.json"]) {
    const result = proxy(new NextRequest(`https://thread.example${path}`));
    assert.equal(result.status, 307);
    assert.equal(result.headers.get("location"), "https://thread.example/login");
  }
  assert.equal(proxy(new NextRequest("https://thread.example/api/health", { method: "POST" })).status, 401);
  assert.equal(proxy(new NextRequest("https://thread.example/thoughts", { headers: { authorization } })).headers.get("x-middleware-next"), "1");
});

test("rejects authenticated cross-site browser writes while allowing same-origin and CLI requests", () => {
  for (const origin of ["https://evil.example", "null", "http://thread.example"]) {
    const request = new Request("https://thread.example/api/transcribe", { method: "POST", headers: { authorization, host: "thread.example", origin } });
    assert.equal(requestAccessFailure(request)?.status, 403);
  }
  const crossSite = new Request("https://thread.example/api/transcribe", { method: "POST", headers: { cookie: `${sessionCookieName()}=${createSession()}`, "sec-fetch-site": "cross-site" } });
  assert.equal(requestAccessFailure(crossSite)?.status, 403);
  const sameOriginHeaders: Record<string, string>[] = [{ origin: "https://thread.example" }, {}];
  for (const extra of sameOriginHeaders) {
    assert.equal(requestAccessFailure(new Request("https://thread.example/api/process", { method: "POST", headers: { authorization, host: "thread.example", ...extra } })), null);
  }
});

test("each sensitive API enforces the gate even when called without proxy", async () => {
  const request = () => new Request("https://thread.example/api", { method: "POST", headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" } });
  for (const operation of [
    () => processThought(request()), () => transcribe(request()), () => save(request()),
    () => index(request(), parameters), () => connect(request(), parameters),
    () => related(new Request("https://thread.example/api"), parameters),
  ]) {
    assert.equal((await operation()).status, 401);
  }
  assert.equal((await processThought(new Request("https://thread.example/api", { method: "POST", headers: { authorization } }))).status, 415);
});
