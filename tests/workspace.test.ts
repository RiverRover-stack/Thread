import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { NextRequest } from "next/server";
import type { PrismaClient } from "../generated/prisma/client";
import { createWorkspaceSession, workspaceCookieName, workspaceFromHeaders, requestWorkspace, requireWorkspaceScope, WORKSPACE_SECONDS } from "../lib/workspace";
import { accessFailure, requestAccessFailure } from "../lib/demo-access";
import { proxy } from "../proxy";
import { listThoughts, getThought, getRelatedThoughts } from "../lib/db/thoughts";
import { storeEmbedding } from "../lib/db/embeddings";
import { POST as save } from "../app/api/thoughts/route";
import { POST as index } from "../app/api/thoughts/[id]/embedding/route";
import { POST as connect } from "../app/api/thoughts/[id]/connection/route";
import { GET as related } from "../app/api/thoughts/[id]/related/route";

const env = { ...process.env };
const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
const originalFetch = globalThis.fetch;
const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "production", THREAD_ACCESS_MODE: "public-demo", THREAD_SESSION_SECRET: "synthetic-workspace-secret-32-characters", DATABASE_URL: "postgresql://unused", EMBEDDING_PROVIDER: "ollama" });
  globalThis.fetch = async () => { throw new Error("Cross-workspace access must not call providers"); };
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
  databaseGlobal.threadPrisma = originalDatabase;
  globalThis.fetch = originalFetch;
});
function session() {
  const token = createWorkspaceSession();
  const headers = new Headers({ cookie: `${workspaceCookieName()}=${token}`, origin: "https://thread.example" });
  return { token, headers, workspace: requestWorkspace(headers)! };
}
test("workspace sessions reject forgery, duplicates, expiry, secret rotation and old Basic credentials", () => {
  const a = session(), b = session();
  assert.notEqual(a.workspace, b.workspace);
  assert.equal(accessFailure(a.headers), null);
  assert.equal(accessFailure(new Headers({ authorization: "Basic dGhyZWFkOnBhc3M=" }))?.status, 401);
  const forged = new Headers({ cookie: `${workspaceCookieName()}=${a.token.slice(0, -1)}${a.token.endsWith("a") ? "b" : "a"}` });
  assert.equal(workspaceFromHeaders(forged), null);
  assert.equal(workspaceFromHeaders(new Headers({ cookie: `${workspaceCookieName()}=${a.token}; ${workspaceCookieName()}=${b.token}` })), null);
  assert.equal(workspaceFromHeaders(a.headers, Date.now() + WORKSPACE_SECONDS * 1000 + 1000), null);
  process.env.THREAD_SESSION_SECRET = "another-synthetic-secret-32-characters";
  assert.equal(workspaceFromHeaders(a.headers), null);
  delete process.env.THREAD_SESSION_SECRET;
  assert.equal(accessFailure(a.headers)?.status, 503);
});
test("first page issues and forwards signed cookie; APIs do not bootstrap workspaces", async () => {
  const response = await proxy(new NextRequest("https://thread.example/", { headers: { "x-workspace-id": "forged" } }));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.match(response.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(workspaceFromHeaders(new Headers({ cookie: response.headers.get("x-middleware-request-cookie")! })));
  assert.equal((await proxy(new NextRequest("https://thread.example/api/thoughts"))).status, 401);
  assert.throws(() => requireWorkspaceScope(null));
});
test("public writes require same-origin even without a shared password", () => {
  delete process.env.THREAD_ACCESS_PASSWORD;
  const { headers } = session();
  assert.equal(requestAccessFailure(new Request("https://thread.example/api/process", { method: "POST", headers })), null);
  headers.set("origin", "https://evil.example");
  assert.equal(requestAccessFailure(new Request("https://thread.example/api/process", { method: "POST", headers }))?.status, 403);
  headers.delete("origin");
  assert.equal(requestAccessFailure(new Request("https://thread.example/api/process", { method: "POST", headers }))?.status, 403);
});
test("timeline/detail and every cross-workspace operation stay scoped, without provider calls", async () => {
  const a = session(), b = session();
  const row = { id, workspaceId: a.workspace, rawTranscript: "Private A", title: "Private", summary: "A", categories: ["study"], actionable: false, possibleAction: null, questionToExplore: null, createdAt: new Date() };
  databaseGlobal.threadPrisma = {
    thought: {
      findMany: async ({ where }: { where: { workspaceId: string } }) => where.workspaceId === a.workspace ? [row] : [],
      findUnique: async ({ where }: { where: { workspaceId: string } }) => where.workspaceId === a.workspace ? row : null,
      upsert: async () => row,
    },
    $queryRaw: async (_sql: TemplateStringsArray, _id: string, workspace: string) => workspace === a.workspace ? [{ rawTranscript: row.rawTranscript, indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 }] : [],
  } as unknown as PrismaClient;
  databaseGlobal.threadPrisma.$transaction = (async (operation: (tx: unknown) => unknown) => operation({
    $queryRaw: async () => [], thought: { findUnique: async () => row },
  })) as typeof databaseGlobal.threadPrisma.$transaction;
  assert.equal((await listThoughts(a.workspace)).length, 1);
  assert.deepEqual(await listThoughts(b.workspace), []);
  assert.equal(await getThought(id, b.workspace), null);
  const params = { params: Promise.resolve({ id }) };
  const request = () => new Request(`https://thread.example/api/thoughts/${id}`, { method: "POST", headers: b.headers });
  assert.equal((await index(request(), params)).status, 404);
  assert.equal((await connect(request(), params)).status, 404);
  assert.equal((await related(new Request("https://thread.example/api/related", { headers: b.headers }), params)).status, 404);
  b.headers.set("content-type", "application/json");
  const body = { id, rawTranscript: row.rawTranscript, structuredThought: { title: row.title, summary: row.summary, categories: row.categories, actionable: false, possibleAction: null, questionToExplore: null } };
  assert.equal((await save(new Request("https://thread.example/api/thoughts", { method: "POST", headers: b.headers, body: JSON.stringify(body) }))).status, 404);
  assert.equal((await save(new Request("https://thread.example/api/thoughts", { method: "POST", headers: new Headers({ ...Object.fromEntries(a.headers), "content-type": "application/json" }), body: JSON.stringify({ ...body, workspaceId: b.workspace }) }))).status, 400);
});
test("retrieval binds both owners and embedding updates bind owner", async () => {
  const { workspace } = session();
  let reads = 0;
  databaseGlobal.threadPrisma = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      if (++reads === 1) {
        assert.deepEqual(values, [id, workspace]);
        return [{ indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 }];
      }
      assert.deepEqual(values.slice(0, 3), [id, workspace, workspace]);
      assert.match(sql.join(""), /current\."workspaceId" IS NOT DISTINCT FROM/);
      assert.match(sql.join(""), /related\."workspaceId" IS NOT DISTINCT FROM/);
      return [];
    },
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      assert.equal(values[4], workspace);
      assert.match(sql.join(""), /"workspaceId" IS NOT DISTINCT FROM/);
      return 0;
    },
  } as unknown as PrismaClient;
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  await getRelatedThoughts(id, workspace);
  assert.equal(await storeEmbedding(id, [1, ...Array(767).fill(0)], "embeddinggemma:300m", 1, workspace), 0);
});

