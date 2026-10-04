import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
// Never run this fixture-writing check against the hosted production database.
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname), "Use the separate localhost development database");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const ids = [randomUUID(), randomUUID(), randomUUID()];
const base = "http://localhost:3103";
let server;
await client.connect();
try {
  const column = await client.query('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', ["Thought", "workspaceId"]);
  assert.equal(column.rowCount, 1, "Apply the ownership migration locally first");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3103"], {
    env: { ...process.env, NODE_ENV: "production", THREAD_ACCESS_MODE: "public-demo", THREAD_PUBLIC_AI_ENABLED: "false", THREAD_SESSION_SECRET: randomBytes(32).toString("hex"), RELATED_THOUGHTS_MIN_SIMILARITY: "0.7", AI_PROVIDER: "google", EMBEDDING_PROVIDER: "google", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "", SENTRY_DSN: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  // Consume output without printing environment or request information.
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Startup. */ }
    if (server.exitCode !== null) throw new Error("Verification server exited");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  async function visit() {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Your thoughts belong to this browser workspace/);
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    return cookie;
  }
  const a = await visit(), b = await visit();
  assert.notEqual(a, b);
  async function call(path, cookie, body, status = 200, method = body ? "POST" : "GET") {
    // Model Render's HTTPS origin while exercising the local production HTTP server.
    const response = await fetch(`${base}${path}`, { method, headers: { cookie, origin: base.replace("http:", "https:"), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status, `${method} ${path}`);
    return response;
  }
  function thought(id, title) {
    return { id, rawTranscript: `Synthetic workspace check: ${title}`, structuredThought: { title, summary: title, categories: ["study"], actionable: false, possibleAction: null, questionToExplore: null } };
  }
  const oldA = thought(ids[0], "Workspace A earlier example"), oldB = thought(ids[1], "Workspace B private example"), currentA = thought(ids[2], "Workspace A current example");
  await call("/api/thoughts", a, oldA);
  await call("/api/thoughts", b, oldB);
  await call("/api/thoughts", a, currentA);
  const retried = await (await call("/api/thoughts", a, currentA)).json();
  assert.equal(retried.thought.id, ids[2]);
  assert.equal("workspaceId" in retried.thought, false);
  await call("/api/thoughts", b, currentA, 404);
  await call("/api/thoughts", b, { ...currentA, workspaceId: "forged-owner" }, 400);
  for (const [cookie, included, excluded] of [[a, oldA.structuredThought.title, oldB.structuredThought.title], [b, oldB.structuredThought.title, oldA.structuredThought.title]]) {
    const html = await (await call("/thoughts", cookie)).text();
    assert.ok(html.includes(included)); assert.ok(!html.includes(excluded));
  }
  await call(`/thoughts/${ids[0]}`, b, undefined, 404);
  await call(`/api/thoughts/${ids[0]}/related`, b, undefined, 404);
  await call(`/api/thoughts/${ids[0]}/embedding`, b, undefined, 404, "POST");
  await call(`/api/thoughts/${ids[0]}/connection`, b, undefined, 404, "POST");
  const vector = JSON.stringify([1, ...Array(767).fill(0)]);
  await client.query('UPDATE "Thought" SET embedding = $1::vector, "embeddingModel" = $2, "embeddingVersion" = 1 WHERE id = ANY($3::uuid[])', [vector, "google:gemini-embedding-2", ids]);
  await client.query('UPDATE "Thought" SET "createdAt" = NOW() WHERE id = ANY($1::uuid[])', [ids]);
  await client.query('UPDATE "Thought" SET "createdAt" = NOW() - INTERVAL \'1 minute\' WHERE id = ANY($1::uuid[])', [ids.slice(0, 2)]);
  const matches = await (await call(`/api/thoughts/${ids[2]}/related`, a)).json();
  assert.deepEqual(matches.relatedThoughts.map(t => t.id), [ids[0]]);
  assert.equal((await (await call(`/api/thoughts/${ids[2]}/embedding`, a, undefined, 200, "POST")).json()).reused, true);
  const legacy = await client.query('SELECT id FROM "Thought" WHERE "workspaceId" IS NULL LIMIT 1');
  if (legacy.rows[0]) await call(`/thoughts/${legacy.rows[0].id}`, a, undefined, 404);
  const tampered = a.slice(0, -1) + (a.endsWith("a") ? "b" : "a");
  await call(`/api/thoughts/${ids[2]}/related`, tampered, undefined, 401);
  const usage = await (await call("/api/usage", a)).json();
  assert.equal(usage.enabled, false); assert.ok(usage.remainingAttempts >= 0 && usage.remainingAttempts <= 5);
  await call("/api/usage", tampered, undefined, 401);
  await call("/api/process", a, { transcript: "Synthetic paused AI check" }, 503);
  await call(`/api/thoughts/${ids[2]}/connection`, a, undefined, 503, "POST");
  const extra = Array.from({ length: 48 }, () => randomUUID());
  ids.push(...extra);
  await client.query('INSERT INTO "Thought" (id, "workspaceId", "rawTranscript", title, summary, categories, actionable) SELECT fixture, $2, \'Synthetic capacity fixture\', \'Capacity\', \'Synthetic capacity fixture\', ARRAY[\'study\'], false FROM unnest($1::uuid[]) fixture', [extra, a.split("=")[1].split(".")[1]]);
  await call("/api/thoughts", a, currentA); // Existing retries still work at capacity.
  await call("/api/thoughts", a, thought(randomUUID(), "Over-capacity example"), 429);
  console.log("PASS: real HTTP sessions, ownership, SQL retrieval isolation, vector reuse, usage endpoint, AI kill switch, 50-thought capacity and idempotent retry. No provider calls.");
} finally {
  // Delete only this run's explicitly identified synthetic fixtures.
  await client.query('DELETE FROM "Thought" WHERE id = ANY($1::uuid[])', [ids]);
  await client.end();
  if (server && server.exitCode === null) { const done = once(server, "exit"); server.kill(); await done; }
}
