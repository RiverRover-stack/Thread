import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { POST } from "../app/api/thoughts/[id]/connection/route";

const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
const originalFetch = globalThis.fetch;
const originalModel = process.env.OLLAMA_EMBEDDING_MODEL;
const originalThreshold = process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
const previousId = "bf375e93-6ff1-4cba-bcf1-574465e949eb";
const current = {
  id, rawTranscript: "Preserve my words.", title: "Device benchmark", summary: "I could benchmark my compressed model.",
  categories: ["project"], actionable: true, possibleAction: "Benchmark the model.", questionToExplore: null,
  createdAt: new Date("2026-10-03T00:00:00Z"),
};
const previous = { ...current, id: previousId, title: "Deployment evidence", summary: "My portfolio needs deployment evidence.", createdAt: new Date("2026-10-02T00:00:00Z") };
const source = { rawTranscript: current.rawTranscript, indexed: true, embeddingModel: "embeddinggemma:300m", embeddingVersion: 1 };
const connected = { hasConnection: true, connection: "Benchmarking could provide the evidence you wanted.", implication: "Deployment measurements could support your portfolio comparison.", questionToExplore: null };
const unconnected = { hasConnection: false, connection: null, implication: null, questionToExplore: null };

beforeEach(() => {
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  globalThis.fetch = async () => { throw new Error("Unexpected model call"); };
});
afterEach(() => {
  databaseGlobal.threadPrisma = originalDatabase;
  globalThis.fetch = originalFetch;
  if (originalModel === undefined) delete process.env.OLLAMA_EMBEDDING_MODEL;
  else process.env.OLLAMA_EMBEDDING_MODEL = originalModel;
  if (originalThreshold === undefined) delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  else process.env.RELATED_THOUGHTS_MIN_SIMILARITY = originalThreshold;
});

function request(thoughtId = id) {
  // The route uses saved server-side content, not a client-supplied thought history.
  return POST(new Request(`http://localhost/api/thoughts/${thoughtId}/connection`, { method: "POST" }), { params: Promise.resolve({ id: thoughtId }) });
}

function mockDatabase(options: { missingCurrent?: boolean; missingCandidate?: boolean; empty?: boolean; unindexed?: boolean; missingSource?: boolean } = {}) {
  let searches = 0;
  databaseGlobal.threadPrisma = {
    thought: { findUnique: async ({ where }: { where: { id: string } }) => where.id === id
      ? options.missingCurrent ? null : current
      : options.missingCandidate ? null : previous },
    $queryRaw: async (sql: TemplateStringsArray) => {
      if (sql.join("").includes('JOIN "Thought"')) {
        searches += 1;
        return options.empty ? [] : [{ id: previousId, title: previous.title, summary: previous.summary, createdAt: previous.createdAt, similarity: 0.85 }];
      }
      return options.missingSource ? [] : [{ ...source, indexed: !options.unindexed }];
    },
  } as unknown as PrismaClient;
  return () => searches;
}

test("loads saved structured fields and returns one validated grouped analysis", async () => {
  const searches = mockDatabase();
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(String(options?.body));
    const content = body.messages[1].content as string;
    const context = JSON.parse(content.slice(content.indexOf("\n") + 1));
    assert.equal(context.currentThought.summary, current.summary);
    assert.equal(context.relatedThoughts.length, 1);
    assert.equal(context.relatedThoughts[0].possibleAction, previous.possibleAction);
    assert.equal(context.relatedThoughts[0].title, previous.title);
    assert.ok(!content.includes(current.rawTranscript));
    assert.equal(context.currentThought.id, undefined);
    return Response.json({ message: { content: JSON.stringify(connected) } });
  };
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), connected);
  assert.equal(searches(), 1);
  assert.equal(calls, 1);
  assert.equal(current.rawTranscript, "Preserve my words.");
});

test("empty or deleted candidates return no connection without calling Gemma", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("Must not call"); };
  for (const options of [{ empty: true }, { missingCandidate: true }]) {
    mockDatabase(options);
    const response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), unconnected);
  }
  assert.equal(calls, 0);
});

test("missing thoughts return 404 and unprepared memory returns 409 before inference", async () => {
  databaseGlobal.threadPrisma = {} as PrismaClient;
  
  const invalidIds = ["not-a-uuid", ""];
  for (const invalidId of invalidIds) assert.equal((await request(invalidId)).status, 404);
  for (const options of [{ missingCurrent: true }, { missingSource: true }]) {
    const searches = mockDatabase(options);
    assert.equal((await request()).status, 404);
    assert.equal(searches(), 0);
  }
  const searches = mockDatabase({ unindexed: true });
  assert.equal((await request()).status, 409);
  assert.equal(searches(), 0);
});

test("keeps model abstention distinct from validation, provider, and database failures", async () => {
  mockDatabase();
  globalThis.fetch = async () => Response.json({ message: { content: JSON.stringify(unconnected) } });
  assert.deepEqual(await (await request()).json(), unconnected);
  globalThis.fetch = async () => Response.json({ message: { content: JSON.stringify({ ...connected, implication: null }) } });
  assert.equal((await request()).status, 502);
  globalThis.fetch = async () => { throw new DOMException("private details", "TimeoutError"); };
  assert.equal((await request()).status, 504);
  globalThis.fetch = async () => { throw new TypeError("private details"); };
  assert.equal((await request()).status, 503);
  databaseGlobal.threadPrisma = { thought: { findUnique: async () => { throw new Error("private details"); } } } as unknown as PrismaClient;
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await failed.text(), /private details/);
});

test("bounds record loading to five candidates and preserves retrieval order", async () => {
  const ids = Array.from({ length: 7 }, (_, i) => `bf375e93-6ff1-4cba-bcf1-574465e949${String(i).padStart(2, "0")}`);
  const loaded: string[] = [];
  databaseGlobal.threadPrisma = {
    thought: { findUnique: async ({ where }: { where: { id: string } }) => {
      if (where.id === id) return current;
      loaded.push(where.id);
      return { ...previous, id: where.id, title: where.id };
    } },
    $queryRaw: async (sql: TemplateStringsArray) => sql.join("").includes('JOIN "Thought"') ? ids.map((candidateId) => ({ id: candidateId })) : [source],
  } as unknown as PrismaClient;
  globalThis.fetch = async (_url, options) => {
    const content = JSON.parse(String(options?.body)).messages[1].content as string;
    const context = JSON.parse(content.slice(content.indexOf("\n") + 1));
    assert.deepEqual(context.relatedThoughts.map((thought: { title: string }) => thought.title), ids.slice(0, 5));
    return Response.json({ message: { content: JSON.stringify(unconnected) } });
  };
  assert.equal((await request()).status, 200);
  assert.deepEqual(loaded, ids.slice(0, 5));
});
