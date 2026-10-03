import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { GET } from "../app/api/thoughts/[id]/related/route";

const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
const originalThreshold = process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
const originalModel = process.env.OLLAMA_EMBEDDING_MODEL;
const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
const source = { rawTranscript: "A saved thought", indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 };

afterEach(() => {
  databaseGlobal.threadPrisma = originalDatabase;
  if (originalThreshold === undefined) delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  else process.env.RELATED_THOUGHTS_MIN_SIMILARITY = originalThreshold;
  if (originalModel === undefined) delete process.env.OLLAMA_EMBEDDING_MODEL;
  else process.env.OLLAMA_EMBEDDING_MODEL = originalModel;
});

function request(thoughtId = id) {
  return GET(new Request(`http://localhost/api/thoughts/${thoughtId}/related`), { params: Promise.resolve({ id: thoughtId }) });
}

test("retrieval binds parameters, excludes incompatible/future thoughts and returns only public fields", async () => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  const related = [{ id, title: "Related", summary: "An older related thought", createdAt: new Date("2026-01-01T00:00:00Z"), similarity: 0.8 }];
  let reads = 0;
  databaseGlobal.threadPrisma = { $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => {
    if (++reads === 1) return [source];
    assert.deepEqual(values, [id, "embeddinggemma:300m", 1, 0.7]);
    const query = sql.join("");
    assert.match(query, /related.id <> current.id/);
    assert.match(query, /related\."createdAt" < current\."createdAt"/);
    assert.match(query, /LIMIT 5/);
    assert.match(query, /ORDER BY similarity DESC/);
    assert.ok(!query.includes('related."rawTranscript"'));
    return related;
  } } as unknown as PrismaClient;
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { relatedThoughts: [{ ...related[0], createdAt: related[0].createdAt.toISOString() }] });
});

test("distinguishes empty matches, missing thought and unprepared memory", async () => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  let reads = 0;
  databaseGlobal.threadPrisma = { $queryRaw: async () => ++reads === 1 ? [source] : [] } as unknown as PrismaClient;
  assert.deepEqual(await (await request()).json(), { relatedThoughts: [] });
  databaseGlobal.threadPrisma = { $queryRaw: async () => [] } as unknown as PrismaClient;
  assert.equal((await request()).status, 404);
  for (const metadata of [{ indexed: false }, { embeddingVersion: 0 }, { embeddingModel: "old-model" }]) {
    databaseGlobal.threadPrisma = { $queryRaw: async () => [{ ...source, ...metadata }] } as unknown as PrismaClient;
    assert.equal((await request()).status, 409);
  }
});

test("rejects invalid IDs without querying and invalid thresholds without searching", async () => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  databaseGlobal.threadPrisma = { $queryRaw: async () => { throw new Error("Must not query"); } } as unknown as PrismaClient;
  assert.equal((await request("not-a-uuid")).status, 404);
  // CHALLENGE: Check malformed similarity configuration using the existing cases.
  // TODO(you): Add "not-a-number" below. Hint 1: these are strings from configuration.
  // Hint 2: Number converts them before validation. Verify: npm test rejects it with 503.
  for (const value of ["NaN", "-0.1", "1.1", "Infinity"]) {
    process.env.RELATED_THOUGHTS_MIN_SIMILARITY = value;
    let reads = 0;
    databaseGlobal.threadPrisma = { $queryRaw: async () => { reads += 1; return [source]; } } as unknown as PrismaClient;
    assert.equal((await request()).status, 503);
    assert.equal(reads, 1);
  }
});

test("supports configured threshold and hides database errors", async () => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  process.env.RELATED_THOUGHTS_MIN_SIMILARITY = "0.85";
  let reads = 0;
  databaseGlobal.threadPrisma = { $queryRaw: async (_sql: unknown, ...values: unknown[]) => {
    if (++reads === 1) return [source];
    assert.equal(values[3], 0.85);
    throw new Error("secret database details");
  } } as unknown as PrismaClient;
  const response = await request();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret database details/);
});
