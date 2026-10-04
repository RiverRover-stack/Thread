import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import type { PrismaClient } from "../generated/prisma/client";
import { embedText } from "../lib/embeddings";
import { embeddingModelName } from "../lib/embeddings/config";
import { EmbeddingError } from "../lib/embeddings/errors";
import { embedTranscript } from "../lib/embeddings/transcript";
import { indexThought } from "../lib/embeddings/index-thought";
import { getRelatedThoughts } from "../lib/db/thoughts";

const originalFetch = globalThis.fetch;
const settings = ["EMBEDDING_PROVIDER", "GEMINI_API_KEY", "AI_PROVIDER", "OLLAMA_BASE_URL", "OLLAMA_EMBEDDING_MODEL", "RELATED_THOUGHTS_MIN_SIMILARITY"] as const;
const originalSettings = Object.fromEntries(settings.map((name) => [name, process.env[name]]));
const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
const vector = [2, ...Array<number>(767).fill(0)];
const normalized = [1, ...Array<number>(767).fill(0)];
const model = "google:gemini-embedding-2";
const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
const source = { rawTranscript: "  Preserve the original.\nExactly.  ", indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 };

beforeEach(() => {
  process.env.EMBEDDING_PROVIDER = "google";
  process.env.GEMINI_API_KEY = "fake-key-never-real";
  delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  globalThis.fetch = async () => { throw new Error("Unexpected provider request"); };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  databaseGlobal.threadPrisma = originalDatabase;
  for (const name of settings) {
    if (originalSettings[name] === undefined) delete process.env[name];
    else process.env[name] = originalSettings[name];
  }
});

test("hosted embedding request preserves input, uses 768 dimensions and the API key header", async () => {
  const text = "  Preserve these spaces.\nAnd this line.  ";
  process.env.AI_PROVIDER = "ollama"; // Reasoning configuration must not select embeddings.
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent");
    assert.equal(new Headers(options?.headers).get("x-goog-api-key"), "fake-key-never-real");
    assert.equal(options?.method, "POST");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: "models/gemini-embedding-2",
      content: { parts: [{ text: `task: sentence similarity | query: ${text}` }] },
      outputDimensionality: 768,
    });
    return Response.json({ embedding: { values: vector }, ignoredMetadata: 1 });
  };
  assert.deepEqual(await embedText(text), vector);
  assert.equal(embeddingModelName(), model);
  assert.deepEqual(await embedTranscript(text), normalized);
});

test("local provider remains default and keeps existing model metadata independently of Google reasoning", async () => {
  process.env.AI_PROVIDER = "google";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  for (const selected of [undefined, "ollama"]) {
    if (selected === undefined) delete process.env.EMBEDDING_PROVIDER;
    else process.env.EMBEDDING_PROVIDER = selected;
    globalThis.fetch = async (url) => {
      assert.equal(url, "http://127.0.0.1:11434/api/embed");
      return Response.json({ embeddings: [vector] });
    };
    assert.deepEqual(await embedText("A thought"), vector);
    assert.equal(embeddingModelName(), "embeddinggemma:300m");
  }
});

async function expectFailure(status: number) {
  await assert.rejects(embedText("A thought"), (error: unknown) => {
    assert.ok(error instanceof EmbeddingError);
    assert.equal(error.status, status);
    assert.doesNotMatch(error.message, /fake-key|PRIVATE_PROVIDER_DETAIL/);
    return true;
  });
}

test("rejects invalid configuration and input before requesting hosted embeddings", async () => {
  process.env.EMBEDDING_PROVIDER = "typo";
  await expectFailure(503);
  assert.throws(embeddingModelName, { status: 503 });
  process.env.EMBEDDING_PROVIDER = "google";
  
  const invalidInputs = ["", " \n ", 42, null];
  for (const text of invalidInputs) {
    await assert.rejects(embedText(text as string), { status: 400 });
  }
  delete process.env.GEMINI_API_KEY;
  await expectFailure(503);
});

test("validates hosted vector dimensions, finite numbers, magnitude, and envelope", async () => {
  for (const value of [null, {}, { embedding: null }, { embedding: { values: [] } },
    { embedding: { values: vector.slice(1) } }, { embedding: { values: vector.concat(0) } },
    { embedding: { values: Array(768).fill(0) } }, { embedding: { values: ["2", ...vector.slice(1)] } },
    { embedding: { values: [null, ...vector.slice(1)] } },
  ]) {
    globalThis.fetch = async () => Response.json(value);
    await expectFailure(502);
  }
  globalThis.fetch = async () => new Response("PRIVATE_PROVIDER_DETAIL");
  await expectFailure(502);
});

test("maps hosted quota, configuration, upstream, network and response-reading timeouts without fallback", async () => {
  for (const [upstream, expected] of [[400, 503], [401, 503], [403, 503], [404, 503], [429, 429], [413, 422], [422, 422], [500, 502]]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      const response = new Response("PRIVATE_PROVIDER_DETAIL", { status: upstream });
      response.json = async () => { throw new Error("Must not read provider error body"); };
      return response;
    };
    await expectFailure(expected);
    assert.equal(calls, 1);
  }
  globalThis.fetch = async () => { throw new TypeError("PRIVATE_PROVIDER_DETAIL"); };
  await expectFailure(503);
  for (const name of ["TimeoutError", "AbortError"]) {
    globalThis.fetch = async () => { throw new DOMException("PRIVATE_PROVIDER_DETAIL", name); };
    await expectFailure(504);
    globalThis.fetch = async () => {
      const response = Response.json({});
      response.json = async () => { throw new DOMException("PRIVATE_PROVIDER_DETAIL", name); };
      return response;
    };
    await expectFailure(504);
  }
});

test("reindexing local vectors writes normalized Google vectors and metadata without changing transcript fields", async () => {
  let calls = 0;
  databaseGlobal.threadPrisma = {
    $queryRaw: async () => [source],
    $executeRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
      assert.deepEqual(values, [JSON.stringify(normalized), model, 1, id, null, model, 1]);
      const statement = sql.join("");
      assert.doesNotMatch(statement, /SET "rawTranscript"|SET "title"|SET "summary"/);
      return 1;
    },
  } as unknown as PrismaClient;
  globalThis.fetch = async () => { calls++; return Response.json({ embedding: { values: vector } }); };
  assert.deepEqual(await indexThought(id), { id, indexed: true, reused: false });
  assert.equal(calls, 1);
  databaseGlobal.threadPrisma = { $queryRaw: async () => [{ ...source, embeddingModel: model }] } as unknown as PrismaClient;
  assert.deepEqual(await indexThought(id), { id, indexed: true, reused: true });
  assert.equal(calls, 1);
});

test("hosted retrieval rejects a local source and searches only matching Google metadata", async () => {
  databaseGlobal.threadPrisma = { $queryRaw: async () => [source] } as unknown as PrismaClient;
  await assert.rejects(getRelatedThoughts(id), { status: 409 });
  let reads = 0;
  databaseGlobal.threadPrisma = { $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
    if (++reads === 1) return [{ ...source, embeddingModel: model }];
    assert.deepEqual(values, [id, null, null, model, 1, 0.7]);
    assert.match(sql.join(""), /related\."embeddingModel" =/);
    return [];
  } } as unknown as PrismaClient;
  assert.deepEqual(await getRelatedThoughts(id), []);
  assert.equal(reads, 2);
});

test("readiness CLI uses the shared hosted adapter and reports a missing key without database or inference calls", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "tsx", "scripts/check-semantic-memory.mjs", "--embedding",
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 10_000,
    env: { ...process.env, EMBEDDING_PROVIDER: "google", GEMINI_API_KEY: "", DATABASE_URL: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set GEMINI_API_KEY on the server to use hosted embeddings/);
  assert.doesNotMatch(result.stderr, /readiness check failed|Database:/);
});
