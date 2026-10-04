import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Credentials stay in the ignored local deployment file; report only statuses/timing.
const configuration = readFileSync(".env.render", "utf8");
const passwordLine = configuration.match(/^THREAD_ACCESS_PASSWORD=(.+)$/m);
assert.ok(passwordLine, "Deployment access password is required");
const password = passwordLine[1].trim().replace(/^(["'])(.*)\1$/, "$2");
const base = "https://thread-e5b3.onrender.com";
const authorization = `Basic ${Buffer.from(`thread:${password}`).toString("base64")}`;
const report = { startedAt: new Date().toISOString(), checks: [], syntheticThoughtId: randomUUID() };
async function request(label, path, init = {}, status = 200) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    ...init, headers: { authorization, ...init.headers }, signal: AbortSignal.timeout(180000),
  });
  const body = await response.json();
  assert.equal(response.status, status, `${label}: unexpected HTTP status`);
  report.checks.push({ label, status: response.status, elapsedMs: Math.round(performance.now() - started) });
  return body;
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
await request("health", "/api/health");
const audio = new FormData();
audio.append("audio", new Blob([readFileSync("plugin-artifacts/render-transcription-check.wav")], { type: "audio/wav" }), "synthetic.wav");
const transcription = await request("ElevenLabs transcription", "/api/transcribe", { method: "POST", body: audio });
assert.equal(typeof transcription.transcript, "string");
assert.ok(transcription.transcript.trim());
const rawTranscript = "Synthetic monitoring check: before choosing a compressed open model for my Raspberry Pi, I should benchmark inference latency and memory on the actual device instead of trusting laptop results.";
const processed = await request("hosted Gemma structuring", "/api/process", json({ transcript: rawTranscript }));
assert.ok(processed.structuredThought?.title);
await request("save synthetic thought", "/api/thoughts", json({ id: report.syntheticThoughtId, rawTranscript, structuredThought: processed.structuredThought }));
const path = `/api/thoughts/${report.syntheticThoughtId}`;
await request("retrieval before indexing is guarded", `${path}/related`, {}, 409);
await request("Google embedding and indexing", `${path}/embedding`, { method: "POST" });
const indexedAgain = await request("index retry reuses the vector", `${path}/embedding`, { method: "POST" });
assert.equal(indexedAgain.reused, true);
const related = await request("pgvector retrieval", `${path}/related`);
assert.ok(Array.isArray(related.relatedThoughts));
report.relatedCount = related.relatedThoughts.length;
const connection = await request("Gemma connection workflow", `${path}/connection`, { method: "POST" });
assert.equal(typeof connection.hasConnection, "boolean");
report.connectionPresent = connection.hasConnection;
report.finishedAt = new Date().toISOString();
writeFileSync("plugin-artifacts/sentry-production-results.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
