import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Explicit target and credentials: never inherit the local development database.
const target = new URL(process.argv[2] || "https://invalid.example");
assert.ok(process.argv[2] && target.protocol === "https:" && target.pathname === "/",
  "Provide the deployed HTTPS origin, with no path or embedded credentials.");
assert.ok(!target.username && !target.password && !target.search && !target.hash);
assert.ok(process.env.THREAD_ACCESS_PASSWORD, "Set THREAD_ACCESS_PASSWORD for the deployed service.");
const authorization = `Basic ${Buffer.from(`thread:${process.env.THREAD_ACCESS_PASSWORD}`).toString("base64")}`;

async function request(path, options = {}, authenticated = true) {
  const response = await fetch(new URL(path, target), {
    ...options, redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: { ...(authenticated ? { authorization } : {}), ...options.headers },
  });
  return response;
}

async function json(path, options = {}) {
  const response = await request(path, options);
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

async function main() {
  const health = await request("/api/health", {}, false);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  for (const path of ["/", "/thoughts", "/api/process", "/api/thoughts"]) {
    assert.equal((await request(path, {}, false)).status, 401, `${path} must require credentials`);
  }
  assert.equal((await request("/api/process", {
    method: "POST", headers: { origin: "https://unrelated.example" },
  })).status, 403);
  assert.equal((await request("/api/process", { method: "POST" })).status, 415);
  assert.equal((await request("/thoughts")).status, 200);
  console.log("HTTPS health, shared-password gate, authenticated page, payload validation, and cross-site rejection passed.");
  if (!process.argv.includes("--write-synthetic")) return;

  // This mode persists three synthetic fixtures and consumes hosted-model quota.
  const transcripts = [
    "I should benchmark my compressed model on a Raspberry Pi.",
    "I enjoyed the rain while walking to the library.",
    "Measure inference latency and memory use on the small deployment device.",
  ];
  const ids = [];
  for (const transcript of transcripts) {
    const { structuredThought } = await json("/api/process", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript }),
    });
    const id = randomUUID();
    const payload = { id, rawTranscript: transcript, structuredThought };
    const save = () => json("/api/thoughts", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    assert.equal((await save()).thought.rawTranscript, transcript);
    assert.equal((await save()).thought.id, id); // Retrying a save is idempotent.
    assert.equal((await json(`/api/thoughts/${id}/embedding`, { method: "POST" })).indexed, true);
    assert.equal((await json(`/api/thoughts/${id}/embedding`, { method: "POST" })).reused, true);
    assert.equal((await request(`/thoughts/${id}`)).status, 200);
    ids.push(id);
    console.log(`Synthetic thought saved and indexed: ${id}`);
  }
  const { relatedThoughts } = await json(`/api/thoughts/${ids[2]}/related`);
  assert.ok(relatedThoughts.some(thought => thought.id === ids[0]), "Expected device benchmarking connection");
  assert.ok(!relatedThoughts.some(thought => thought.id === ids[1]), "Unrelated weather fixture must be excluded");
  const connection = await json(`/api/thoughts/${ids[2]}/connection`, { method: "POST" });
  assert.equal(connection.hasConnection, true, "Review Gemma's synthetic connection decision");
  assert.ok(connection.connection && connection.implication);
  console.log("Related ranking and hosted connection:", JSON.stringify({ relatedThoughts, connection }, null, 2));
  console.log("Synthetic fixtures remain in the production timeline for manual review; no local database was used.");
}

main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : "Deployment check failed. Inspect HTTP status and Render logs.");
  process.exitCode = 1;
});
