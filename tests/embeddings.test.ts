import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { embedText } from "../lib/embeddings";
import { EmbeddingError } from "../lib/embeddings/errors";
import { embeddingVectorSchema } from "../lib/embeddings/schemas";

const originalFetch = globalThis.fetch;
const envKeys = ["OLLAMA_BASE_URL", "OLLAMA_EMBEDDING_MODEL", "OLLAMA_MODEL"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const validVector = [1, ...Array<number>(767).fill(0)];

beforeEach(() => {
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/";
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  process.env.OLLAMA_MODEL = "gemma3:4b";
  globalThis.fetch = async () => { throw new Error("Unexpected embedding request"); };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function expectedError(status: number, message?: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof EmbeddingError);
    assert.equal(error.status, status);
    assert.ok(!error.message.includes("PRIVATE_PROVIDER_DETAIL"));
    if (message) assert.match(error.message, message);
    return true;
  };
}

test("embeds exact input with independent model configuration and validates the response", async () => {
  process.env.OLLAMA_EMBEDDING_MODEL = " custom-embedding-model ";
  const text = "  Preserve these spaces.\nAnd this line.  ";
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "http://127.0.0.1:11434/api/embed");
    assert.equal(options?.method, "POST");
    assert.deepEqual(options?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: "custom-embedding-model",
      input: `task: sentence similarity | query: ${text}`,
      dimensions: 768,
      truncate: false,
      keep_alive: "5m",
    });
    assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal instanceof AbortSignal);
    return Response.json({ embeddings: [validVector], total_duration: 123 });
  };
  assert.deepEqual(await embedText(text), validVector);
});

test("uses embedding defaults without changing the structuring model", async () => {
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_EMBEDDING_MODEL;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "http://127.0.0.1:11434/api/embed");
    assert.equal(JSON.parse(String(options?.body)).model, "embeddinggemma:300m");
    return Response.json({ embeddings: [validVector] });
  };
  await embedText("A short thought");
  assert.equal(process.env.OLLAMA_MODEL, "gemma3:4b");
});

test("rejects empty or non-string input before calling Ollama", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ embeddings: [validVector] }); };
  for (const input of ["", " \n\t ", null, 42]) {
    await assert.rejects(embedText(input as string), expectedError(400));
  }
  assert.equal(calls, 0);
});

test("rejects malformed response shapes and vectors", async () => {
  const invalidResponses = [
    null, {}, { embeddings: null }, { embeddings: [] },
    { embeddings: [validVector, validVector] },
    { embeddings: [validVector.slice(1)] },
    { embeddings: [validVector.concat(0)] },
    { embeddings: [Array(768).fill(0)] },
    { embeddings: [["1", ...validVector.slice(1)]] },
    { embeddings: [[null, ...validVector.slice(1)]] },
  ];
  for (const result of invalidResponses) {
    globalThis.fetch = async () => Response.json(result);
    await assert.rejects(embedText("A thought"), expectedError(502, /invalid vector/));
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(embeddingVectorSchema.safeParse([value, ...validVector.slice(1)]).success, false);
  }
  assert.equal(embeddingVectorSchema.safeParse(Array(768).fill(Number.MAX_VALUE)).success, false);
});

test("handles unreadable JSON without exposing provider contents", async () => {
  globalThis.fetch = async () => new Response("PRIVATE_PROVIDER_DETAIL", { status: 200 });
  await assert.rejects(embedText("A thought"), expectedError(502, /unreadable response/));
});

test("maps provider errors to safe messages without reading their bodies", async () => {
  for (const [providerStatus, status] of [[404, 503], [400, 422], [413, 422], [422, 422], [429, 429], [500, 502]]) {
    globalThis.fetch = async () => {
      const response = new Response("PRIVATE_PROVIDER_DETAIL", { status: providerStatus });
      response.json = async () => { throw new Error("Error bodies must not be read"); };
      return response;
    };
    await assert.rejects(embedText("A thought"), expectedError(status));
  }
});

test("handles network failure and timeouts during fetch or response reading", async () => {
  globalThis.fetch = async () => { throw new TypeError("PRIVATE_PROVIDER_DETAIL"); };
  await assert.rejects(embedText("A thought"), expectedError(503, /Could not reach Ollama/));
  for (const name of ["TimeoutError", "AbortError"]) {
    globalThis.fetch = async () => { throw new DOMException("PRIVATE_PROVIDER_DETAIL", name); };
    await assert.rejects(embedText("A thought"), expectedError(504));
    globalThis.fetch = async () => {
      const response = Response.json({ embeddings: [validVector] });
      response.json = async () => { throw new DOMException("PRIVATE_PROVIDER_DETAIL", name); };
      return response;
    };
    await assert.rejects(embedText("A thought"), expectedError(504));
  }
});
