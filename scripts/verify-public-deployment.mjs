import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const target = new URL(process.argv[2] || "https://invalid.example");
assert.ok(process.argv[2] && target.protocol === "https:" && target.pathname === "/");
assert.ok(!target.username && !target.password && !target.search && !target.hash);
const paused = process.argv.includes("--paused");
const audioPaths = process.argv.slice(3).filter(value => !value.startsWith("--"));
assert.ok(paused || audioPaths.length === 2, "Provide --paused, or exactly two synthetic WAV files. Paid calls are never retried.");

async function request(path, cookie, options = {}) {
  return fetch(new URL(path, target), { ...options, redirect: "manual", signal: AbortSignal.timeout(120_000),
    headers: { ...(cookie ? { cookie } : {}), origin: target.origin, ...options.headers } });
}
async function checked(path, cookie, options = {}, status = 200) {
  const response = await request(path, cookie, options);
  assert.equal(response.status, status, `${options.method || "GET"} ${path}: HTTP ${response.status}`);
  assert.ok(/no-store/.test(response.headers.get("cache-control") || ""));
  return response;
}
const post = body => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function visit() {
  const response = await checked("/");
  assert.match(await response.text(), /Your thoughts belong to this browser workspace/);
  const header = response.headers.get("set-cookie");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Max-Age=2592000"]) assert.ok(header?.includes(flag));
  return header.split(";")[0];
}
async function main() {
  assert.deepEqual(await (await checked("/api/health")).json(), { status: "ok" });
  await checked("/api/usage", undefined, {}, 401);
  const a = await visit(), b = await visit();
  assert.notEqual(a, b);
  const initial = await (await checked("/api/usage", a)).json();
  assert.equal(initial.enabled, !paused);
  assert.deepEqual(initial.resets.map(reset => reset.timezone), ["UTC", "Asia/Kolkata"]);
  await checked("/api/process", a, { ...post({ transcript: "Synthetic same-origin rejection" }), headers: { "content-type": "application/json", origin: "https://unrelated.example" } }, 403);
  await checked("/api/usage", a.slice(0, -1) + (a.endsWith("a") ? "b" : "a"), {}, 401);
  if (paused) {
    await checked("/api/process", a, post({ transcript: "Synthetic disabled AI check" }), 503);
    assert.equal((await (await checked("/api/usage", a)).json()).remainingAttempts, initial.remainingAttempts);
    console.log("PASS public rollout with AI paused: secure independent visitor cookies, both reset calendars, forged-cookie/cross-origin rejection, and unchanged recording allowance.");
    return;
  }
  assert.ok(initial.remainingAttempts >= 2, "Two recording attempts are required for the synthetic live workflow");
  const invalid = new FormData(); invalid.set("audio", new Blob(["not audio"], { type: "audio/wav" }), "invalid.wav");
  await checked("/api/transcribe", a, { method: "POST", body: invalid }, 422);
  assert.equal((await (await checked("/api/usage", a)).json()).remainingAttempts, initial.remainingAttempts);
  const results = [];
  for (const file of audioPaths) {
    const form = new FormData(); form.set("audio", new Blob([await readFile(file)], { type: "audio/wav" }), "synthetic.wav");
    const { transcript } = await (await checked("/api/transcribe", a, { method: "POST", body: form })).json();
    assert.ok(transcript?.length > 10);
    const { structuredThought } = await (await checked("/api/process", a, post({ transcript }))).json();
    const id = randomUUID(), payload = { id, rawTranscript: transcript, structuredThought };
    assert.equal((await (await checked("/api/thoughts", a, post(payload))).json()).thought.id, id);
    assert.equal((await (await checked("/api/thoughts", a, post(payload))).json()).thought.id, id);
    assert.equal((await (await checked(`/api/thoughts/${id}/embedding`, a, { method: "POST" })).json()).indexed, true);
    assert.equal((await (await checked(`/api/thoughts/${id}/embedding`, a, { method: "POST" })).json()).reused, true);
    await checked(`/thoughts/${id}`, b, {}, 404);
    for (const suffix of ["related", "embedding", "connection"]) await checked(`/api/thoughts/${id}/${suffix}`, b, { method: suffix === "related" ? "GET" : "POST" }, 404);
    await checked("/api/thoughts", b, post(payload), 404);
    assert.ok(!(await (await checked("/thoughts", b)).text()).includes(id));
    results.push({ id, transcript, structuredThought });
    console.log(`PASS synthetic recording ${results.length}: transcription, Gemma, save/retry, embeddings/reuse, and cross-visitor isolation.`);
  }
  const related = await (await checked(`/api/thoughts/${results[1].id}/related`, a)).json();
  assert.ok(related.relatedThoughts.some(thought => thought.id === results[0].id), "Two related recordings must retrieve each other");
  const connection = await (await checked(`/api/thoughts/${results[1].id}/connection`, a, { method: "POST" })).json();
  assert.equal(connection.hasConnection, true);
  assert.ok(connection.connection && connection.implication);
  const final = await (await checked("/api/usage", a)).json();
  assert.equal(final.remainingAttempts, initial.remainingAttempts - 2);
  await writeFile(".public-demo-verification.json", JSON.stringify({ verifiedAt: new Date().toISOString(), origin: target.origin, results, related, connection, usage: final }, null, 2));
  console.log("PASS live related retrieval, Gemma connection, and two retained recording reservations. Synthetic fixtures remain isolated in this verification workspace. Evidence: .public-demo-verification.json (no cookie or credentials).");
}
main().catch(error => {
  console.error(error instanceof assert.AssertionError ? error.message : "Live verification failed; inspect the failing stage and Render logs. No paid call was retried.");
  process.exitCode = 1;
});
