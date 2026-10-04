import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as Sentry from "@sentry/nextjs";
import { sanitizeError, sanitizeSpan, safeAttributes, traceSampleRate } from "../lib/observability/privacy";
import { recordCandidateCount, recordUsage, traceOperation } from "../lib/observability/trace";
import { initializeSentry, sentryOptions } from "../sentry.server.config";
import { structureThought } from "../lib/ai";
import { UsageError } from "../lib/usage";
import { EmbeddingError } from "../lib/embeddings/errors";

const secret = "PRIVATE_THOUGHT_PASSWORD_API_KEY";
const envelopes: unknown[] = [];
let rejectDelivery = false;
const originalFetch = globalThis.fetch;
const originalSettings = { AI_PROVIDER: process.env.AI_PROVIDER, GEMINI_API_KEY: process.env.GEMINI_API_KEY };

after(async () => {
  await Sentry.close(2000);
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalSettings)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("unconfigured monitoring preserves outputs and the exact application error", async () => {
  assert.equal(Sentry.isEnabled(), false);
  let calls = 0;
  assert.equal(await traceOperation("structure", {}, async () => { calls++; return secret; }), secret);
  const error = new Error(secret);
  await assert.rejects(traceOperation("structure", {}, async () => { throw error; }), (actual) => actual === error);
  assert.equal(calls, 1);
});

test("span export uses an allowlist, stripping prompts, SQL, links and arbitrary names", () => {
  const span = sanitizeSpan({
    name: secret, trace_id: "a".repeat(32), span_id: "b".repeat(16),
    start_timestamp: 1, end_timestamp: 2, is_segment: true, status: "ok",
    attributes: {
      "gen_ai.request.messages": secret, "db.query.text": secret, "http.request.header.authorization": secret,
      "thread.stage": "connect", "gen_ai.provider.name": { value: "google" },
      "gen_ai.usage.input_tokens": 23, "gen_ai.request.model": "gemma-4-26b-a4b-it",
      "thread.candidate_count": -1,
    },
    links: [{ trace_id: "a".repeat(32), span_id: "b".repeat(16), attributes: { secret } }],
  });
  assert.equal(span.name, "Thread request");
  assert.equal(span.links, undefined);
  assert.equal(JSON.stringify(span).includes(secret), false);
  assert.deepEqual(span.attributes, {
    "thread.stage": "connect", "gen_ai.provider.name": "google", "gen_ai.usage.input_tokens": 23,
    "gen_ai.request.model": "gemma-4-26b-a4b-it",
  });
  assert.deepEqual(safeAttributes({ "gen_ai.usage.output_tokens": Infinity, "thread.stage": secret }), {});
});

test("error export discards content from requests, exceptions, breadcrumbs and scope", () => {
  const event = sanitizeError({ type: undefined, message: secret, tags: { "thread.stage": "connect", secret },
    request: { data: secret, headers: { cookie: secret } }, extra: { secret }, user: { email: secret },
    breadcrumbs: [{ message: secret }], exception: { values: [{ value: secret }] },
    contexts: { trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), data: { secret } } },
  });
  assert.equal(event?.message, "Thread connect failed");
  assert.equal(JSON.stringify(event).includes(secret), false);
  assert.equal(sanitizeError({ type: undefined, message: secret }), null);
  const storage = sanitizeError({ type: undefined, message: secret, tags: { "thread.stage": "allowance" }, extra: { secret } });
  assert.equal(storage?.message, "Thread allowance failed");
  assert.equal(JSON.stringify(storage).includes(secret), false);
});

test("sampling is bounded and all automatic content collection is disabled", () => {
  assert.equal(traceSampleRate(undefined), 0.1);
  assert.equal(traceSampleRate("0"), 0);
  assert.equal(traceSampleRate("1"), 1);
  for (const value of ["NaN", "-1", "2", "Infinity"]) assert.equal(traceSampleRate(value), 0.1);
  const options = sentryOptions("https://public@example.com/1");
  assert.equal(options.defaultIntegrations, false);
  assert.equal(options.dataCollection?.userInfo, false);
  assert.deepEqual(options.dataCollection?.genAI, { inputs: false, outputs: false });
  assert.deepEqual(options.dataCollection?.httpBodies, []);
});

test("real SDK exports nested workflow, retrieval and inference spans without private data", async () => {
  initializeSentry({ ...sentryOptions("https://public@example.com/1"), tracesSampleRate: 1,
    transport: () => ({
      send: async (envelope: unknown) => {
        envelopes.push(JSON.parse(JSON.stringify(envelope)));
        if (rejectDelivery) throw new Error("Simulated Sentry outage");
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  Sentry.setUser({ email: secret });
  Sentry.setExtra("private", secret);
  Sentry.addBreadcrumb({ message: secret });
  const output = await traceOperation("connection-workflow", { "gen_ai.operation.type": "agent" }, async () => {
    await traceOperation("retrieve", { "gen_ai.operation.type": "tool" }, async () => { recordCandidateCount(2); return [secret]; });
    return traceOperation("connect", { "gen_ai.provider.name": "google" }, async () => { recordUsage(12, 6); return secret; });
  });
  assert.equal(output, secret);
  await Sentry.flush(2000);
  const serialized = JSON.stringify(envelopes);
  assert.ok(serialized.includes("thread.connection-workflow"));
  assert.ok(serialized.includes("thread.retrieve"));
  assert.ok(serialized.includes("thread.connect"));
  assert.ok(serialized.includes("gen_ai.usage.input_tokens"));
  assert.equal(serialized.includes(secret), false);
});

test("Google response usage is measured while thought content remains only in the result", async () => {
  process.env.AI_PROVIDER = "google";
  process.env.GEMINI_API_KEY = secret;
  const thought = { title: "Synthetic thought", summary: secret, categories: ["study"], actionable: false,
    possibleAction: null, questionToExplore: null };
  globalThis.fetch = async () => Response.json({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(thought) }] } }],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 10, thoughtsTokenCount: 3 },
  });
  assert.deepEqual(await structureThought(secret), thought);
  await Sentry.flush(2000);
  const serialized = JSON.stringify(envelopes);
  assert.ok(serialized.includes("thread.structure"));
  assert.equal(serialized.includes(secret), false);
});

test("an enclosing framework span cannot export its arbitrary name or attributes", async () => {
  await Sentry.startSpan({ name: secret, attributes: { "http.url": secret } }, () =>
    traceOperation("retrieve", {}, async () => [secret]));
  await Sentry.flush(2000);
  assert.equal(JSON.stringify(envelopes).includes(secret), false);
});

test("operation failures keep their original error and emit only a safe stage failure", async () => {
  const error = Object.assign(new Error(secret), { status: 429 });
  let calls = 0;
  await assert.rejects(traceOperation("embed", {}, async () => { calls++; throw error; }), (actual) => actual === error);
  await Sentry.flush(2000);
  assert.equal(calls, 1);
  assert.ok(JSON.stringify(envelopes).includes("Thread embed failed"));
  assert.equal(JSON.stringify(envelopes).includes(secret), false);
});

test("quota denials and pre-index guards retain traces without creating failure issues", async () => {
  const start = envelopes.length;
  for (const error of [new UsageError("Allowance exhausted", 429, 60), new EmbeddingError("Index first", 409)]) {
    await assert.rejects(traceOperation("retrieve", {}, async () => { throw error; }), actual => actual === error);
  }
  await Sentry.flush(2000);
  const output = JSON.stringify(envelopes.slice(start));
  assert.ok(!output.includes("Thread retrieve failed"));
  assert.ok(output.includes("skipped"));
});

test("Sentry delivery failure does not change or retry a successful provider operation", async () => {
  rejectDelivery = true;
  let calls = 0;
  assert.equal(await traceOperation("structure", {}, async () => { calls++; return secret; }), secret);
  await Sentry.flush(2000);
  assert.equal(calls, 1);
});
