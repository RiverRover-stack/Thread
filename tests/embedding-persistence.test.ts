import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { POST } from "../app/api/thoughts/[id]/embedding/route";
import { storeEmbedding } from "../lib/db/embeddings";

const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
const originalFetch = globalThis.fetch;
const originalModel = process.env.OLLAMA_EMBEDDING_MODEL;
const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
const vector = [1, ...Array<number>(767).fill(0)];
const source = { rawTranscript: "  Preserve this thought.\nExactly.  ", indexed: false, embeddingModel: null, embeddingVersion: null };

beforeEach(() => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  globalThis.fetch = async () => { throw new Error("Unexpected provider call"); };
});
afterEach(() => {
  databaseGlobal.threadPrisma = originalDatabase;
  globalThis.fetch = originalFetch;
  if (originalModel === undefined) delete process.env.OLLAMA_EMBEDDING_MODEL;
  else process.env.OLLAMA_EMBEDDING_MODEL = originalModel;
});

function request(thoughtId = id) {
  return POST(new Request(`http://localhost/api/thoughts/${thoughtId}/embedding`, { method: "POST" }), { params: Promise.resolve({ id: thoughtId }) });
}

test("indexes stored text and binds vector, metadata and UUID as SQL parameters", async () => {
  let writes = 0;
  databaseGlobal.threadPrisma = {
    $queryRaw: async (_sql: unknown, parameter: string) => { assert.equal(parameter, id); return [source]; },
    $executeRaw: async (sql: TemplateStringsArray, ...parameters: unknown[]) => {
      writes += 1;
      assert.deepEqual(parameters, [JSON.stringify(vector), "embeddinggemma:300m", 1, id, "embeddinggemma:300m", 1]);
      assert.ok(sql.join("").includes("IS DISTINCT FROM"));
      assert.ok(!sql.join("").includes(source.rawTranscript));
      return 1;
    },
  } as unknown as PrismaClient;
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).input, `task: sentence similarity | query: ${source.rawTranscript}`);
    return Response.json({ embeddings: [vector] });
  };
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { id, indexed: true, reused: false });
  assert.equal(writes, 1);
});

test("reuses compatible embeddings without calling Ollama or writing", async () => {
  databaseGlobal.threadPrisma = { $queryRaw: async () => [{ ...source, indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 }] } as unknown as PrismaClient;
  assert.deepEqual(await (await request()).json(), { id, indexed: true, reused: true });
});

test("regenerates embeddings when model or recipe differs", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ embeddings: [vector] }); };
  for (const metadata of [{ embeddingModel: "another-model", embeddingVersion: 1 }, { embeddingModel: "embeddinggemma:300m", embeddingVersion: 0 }]) {
    databaseGlobal.threadPrisma = { $queryRaw: async () => [{ ...source, indexed: true, ...metadata }], $executeRaw: async () => 1 } as unknown as PrismaClient;
    assert.equal((await request()).status, 200);
  }
  assert.equal(calls, 2);
});

test("handles invalid IDs, missing thoughts and concurrent completion", async () => {
  databaseGlobal.threadPrisma = { $queryRaw: async () => { throw new Error("Invalid IDs must not query"); } } as unknown as PrismaClient;
  // CHALLENGE: Verify another invalid URL ID is rejected before database access.
  // TODO(you): Add an empty string to invalidIds. Hint 1: keep the array syntax.
  // Hint 2: request accepts the ID directly. Verify: npm test still passes without querying.
  const invalidIds = ["invalid-id"];
  for (const invalidId of invalidIds) assert.equal((await request(invalidId)).status, 404);
  databaseGlobal.threadPrisma = { $queryRaw: async () => [] } as unknown as PrismaClient;
  assert.equal((await request()).status, 404);
  let reads = 0;
  databaseGlobal.threadPrisma = {
    $queryRaw: async () => ++reads === 1 ? [source] : [{ ...source, indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 }],
    $executeRaw: async () => 0,
  } as unknown as PrismaClient;
  globalThis.fetch = async () => Response.json({ embeddings: [vector] });
  assert.deepEqual(await (await request()).json(), { id, indexed: true, reused: true });
});

test("indexing failure cannot overwrite stored content or return provider details", async () => {
  let writes = 0;
  databaseGlobal.threadPrisma = { $queryRaw: async () => [source], $executeRaw: async () => { writes += 1; return 1; } } as unknown as PrismaClient;
  globalThis.fetch = async () => new Response("private provider data", { status: 500 });
  const response = await request();
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private provider data/);
  assert.equal(writes, 0);
  await assert.rejects(storeEmbedding(id, [NaN], "embeddinggemma:300m", 1));
  assert.equal(writes, 0);
  databaseGlobal.threadPrisma = { $queryRaw: async () => { throw new Error("secret database configuration"); } } as unknown as PrismaClient;
  const databaseFailure = await request();
  assert.equal(databaseFailure.status, 503);
  assert.doesNotMatch(await databaseFailure.text(), /secret database configuration/);
});
