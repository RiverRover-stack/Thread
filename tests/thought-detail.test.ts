import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { PrismaClient } from "../generated/prisma/client";
import { getThought, thoughtContentSelect } from "../lib/db/thoughts";

const databaseGlobal = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = databaseGlobal.threadPrisma;
afterEach(() => {
  databaseGlobal.threadPrisma = originalDatabase;
  mock.restoreAll();
});

test("invalid detail IDs are rejected without querying PostgreSQL", async () => {
  const lookup = mock.fn(async () => { throw new Error("Must not query for invalid IDs"); });
  databaseGlobal.threadPrisma = { thought: { findUnique: lookup } } as unknown as PrismaClient;
  for (const id of ["", "not-a-uuid", "' OR 1=1 --"]) {
    assert.equal(await getThought(id), null);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test("missing thoughts return null while database failures propagate", async () => {
  const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
  const lookup = mock.fn(async (query: unknown) => {
    assert.deepEqual(query, { where: { id }, select: thoughtContentSelect });
    return null;
  });
  databaseGlobal.threadPrisma = { thought: { findUnique: lookup } } as unknown as PrismaClient;
  assert.equal(await getThought(id), null);
  databaseGlobal.threadPrisma = { thought: { findUnique: async () => { throw new Error("Database unavailable"); } } } as unknown as PrismaClient;
  await assert.rejects(getThought(id), /Database unavailable/);
});
