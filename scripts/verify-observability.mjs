// Runs the compiled Next server with synthetic inputs and local HTTP fixtures.
// No production database, real AI credentials or Sentry account are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { gunzipSync, inflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const marker = "SYNTHETIC_PRIVATE_TRANSCRIPT_DO_NOT_EXPORT";
const password = "synthetic-access-password-only";
const thought = { title: "Synthetic API practice", summary: marker, categories: ["study"],
  actionable: false, possibleAction: null, questionToExplore: null };
const payloads = [];
let modelCalls = 0;
let modelFailure = false;
let deliveryFailure = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function waitFor(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(200);
  }
  throw new Error(`Timed out: ${label}`);
}

const fixture = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = Buffer.concat(chunks);
  if (request.url === "/api/chat") {
    modelCalls++;
    const input = JSON.parse(body.toString());
    assert.ok(input.messages.some((message) => message.content.includes(marker)));
    response.writeHead(modelFailure ? 503 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(modelFailure ? { error: marker } : {
      message: { content: JSON.stringify(thought) }, prompt_eval_count: 24, eval_count: 8,
    }));
    return;
  }
  if (request.headers["content-encoding"] === "gzip") body = gunzipSync(body);
  if (request.headers["content-encoding"] === "deflate") body = inflateSync(body);
  payloads.push(body.toString());
  response.writeHead(deliveryFailure ? 503 : 200, { "content-type": "application/json" });
  response.end("{}");
});

let child;
try {
  const fixturePort = await listen(fixture);
  const temporary = createServer();
  const appPort = await listen(temporary);
  await new Promise((resolve) => temporary.close(resolve));
  const origin = `http://127.0.0.1:${appPort}`;
  child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(appPort)], {
    cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", GEMINI_API_KEY: "", ELEVENLABS_API_KEY: "",
      THREAD_ACCESS_PASSWORD: password, AI_PROVIDER: "ollama", OLLAMA_MODEL: "gemma3:4b",
      OLLAMA_BASE_URL: `http://127.0.0.1:${fixturePort}`,
      SENTRY_DSN: `http://public@127.0.0.1:${fixturePort}/1`, SENTRY_TRACES_SAMPLE_RATE: "1",
    },
  });
  await waitFor(async () => {
    try { return (await fetch(`${origin}/api/health`)).status === 200; } catch { return false; }
  }, "Next server startup");
  const headers = { "content-type": "application/json", authorization: `Basic ${Buffer.from(`thread:${password}`).toString("base64")}` };
  const processThought = () => fetch(`${origin}/api/process`, {
    method: "POST", headers, body: JSON.stringify({ transcript: marker }),
  });
  const success = await processThought();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { structuredThought: thought });
  await waitFor(() => payloads.some((body) => body.includes("thread.structure")), "HTTP trace delivery");
  const joined = payloads.join("\n");
  assert.ok(joined.includes("gen_ai.usage.input_tokens"));
  assert.ok(joined.includes("gen_ai.usage.output_tokens"));
  assert.ok(joined.includes("gemma3:4b"));
  assert.equal(joined.includes(marker), false);
  assert.equal(joined.includes(password), false);
  assert.equal(modelCalls, 1);
  console.log("PASS: production startup, authenticated API, HTTP trace delivery, model usage and privacy");

  modelFailure = true;
  const failure = await processThought();
  assert.equal(failure.status, 502);
  assert.equal(JSON.stringify(await failure.json()).includes(marker), false);
  await waitFor(() => payloads.some((body) => body.includes("Thread structure failed")), "safe failure event");
  assert.equal(payloads.join("\n").includes(marker), false);
  assert.equal(modelCalls, 2);
  console.log("PASS: model failure keeps API error behavior and emits a redacted event");

  modelFailure = false;
  deliveryFailure = true;
  const before = payloads.length;
  const outage = await processThought();
  assert.equal(outage.status, 200);
  assert.deepEqual(await outage.json(), { structuredThought: thought });
  await waitFor(() => payloads.length > before, "delivery outage attempt");
  assert.equal(modelCalls, 3);
  console.log("PASS: telemetry receiver returning 503 leaves the API working without duplicate model calls");
  console.log("Live Sentry dashboard ingestion remains unverified: this receiver is a local fixture.");
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
