import assert from "node:assert/strict";
import { afterEach, test, mock } from "node:test";
import { POST } from "../app/api/thoughts/route";
import type { PrismaClient } from "../generated/prisma/client";

const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
function mockDatabase(upsert: (query: unknown) => Promise<unknown>) {
  const method = mock.fn(upsert);
  databaseGlobal.threadPrisma = { thought: { upsert: method } } as unknown as PrismaClient;
  return method;
}

const originalUrl = process.env.DATABASE_URL;
afterEach(() => {
  mock.restoreAll();
  databaseGlobal.threadPrisma = originalDatabase;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

const payload = {
  id: "bf375e93-6ff1-4cba-bcf1-574465e949ea",
  rawTranscript: "  I should review APIs.\nTomorrow morning!  ",
  structuredThought: {
    title: "Review APIs", summary: "The user plans to review APIs tomorrow morning.",
    categories: ["study"], actionable: true,
    possibleAction: "Review APIs tomorrow morning.", questionToExplore: null,
  },
};

function request(body: unknown = payload) {
  return new Request("http://localhost/api/thoughts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("saves the exact raw transcript and retries without overwriting", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  const row = { id: payload.id, rawTranscript: payload.rawTranscript, ...payload.structuredThought, createdAt: new Date() };
  const upsert = mockDatabase(async (query: unknown) => {
    assert.deepEqual(query, {
      where: { id: payload.id }, create: { id: payload.id, rawTranscript: payload.rawTranscript, ...payload.structuredThought }, update: {},
    });
    return row;
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).thought.rawTranscript, payload.rawTranscript);
  }
  assert.equal(upsert.mock.callCount(), 2);
});

test("rejects invalid input and missing configuration", async () => {
  for (const body of [{ ...payload, id: "not-a-uuid" }, { ...payload, rawTranscript: " " },
    { ...payload, structuredThought: { ...payload.structuredThought, actionable: false } }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  delete process.env.DATABASE_URL;
  assert.equal((await POST(request())).status, 503);
});

test("rejects a reused ID with different content and hides database errors", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  mockDatabase(async () => ({
    id: payload.id, rawTranscript: "Different original text", ...payload.structuredThought, createdAt: new Date(),
  }));
  assert.equal((await POST(request())).status, 409);
  mock.restoreAll();
  mockDatabase(async () => { throw new Error("secret connection details"); });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret connection details/);
});
