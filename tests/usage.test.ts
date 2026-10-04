import assert from "node:assert/strict";
import { beforeEach, afterEach, test, mock } from "node:test";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "../generated/prisma/client";
import { reserveProviderCall, usageWindows, UsageError, usageFailure } from "../lib/usage";
import { structureThought, findThoughtConnection } from "../lib/ai";
import { embedTranscript } from "../lib/embeddings/transcript";
import { transcribeAudio } from "../lib/speech";
import { trimDemoAudio } from "../lib/speech/trim-audio";

const originalEnv = { ...process.env }, originalFetch = globalThis.fetch;
const db = globalThis as unknown as { threadPrisma?: PrismaClient };
const originalDatabase = db.threadPrisma;
let used: Map<string, number>, calls: number;
const structured = { title: "Example", summary: "A synthetic thought", categories: ["study"], actionable: false, possibleAction: null, questionToExplore: null };
function fakeDatabase(exhausted = false) {
  db.threadPrisma = { $transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
    const before = new Map(used);
    try { return await operation({
      $queryRaw: async () => [],
      usageCounter: {
        upsert: async ({ where }: { where: { stage_scope_bucket_startsAt: { stage: string; scope: string } } }) => {
          const { stage, scope } = where.stage_scope_bucket_startsAt;
          return { used: exhausted ? 1000 : used.get(`${stage}:${scope}`) || 0 };
        },
        update: async ({ where }: { where: { stage_scope_bucket_startsAt: { stage: string; scope: string } } }) => {
          const { stage, scope } = where.stage_scope_bucket_startsAt, key = `${stage}:${scope}`;
          used.set(key, (used.get(key) || 0) + 1);
        },
      },
    }); } catch (error) { used = before; throw error; }
  } } as unknown as PrismaClient;
}
beforeEach(() => {
  Object.assign(process.env, { THREAD_ACCESS_MODE: "public-demo", THREAD_PUBLIC_AI_ENABLED: "true", THREAD_QUOTA_TIMEZONE: "Asia/Kolkata", AI_PROVIDER: "ollama", EMBEDDING_PROVIDER: "ollama", ELEVENLABS_API_KEY: "synthetic" });
  used = new Map(); calls = 0; fakeDatabase();
  globalThis.fetch = async () => { calls++; return Response.json({ message: { content: JSON.stringify(structured) } }); };
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv); globalThis.fetch = originalFetch; db.threadPrisma = originalDatabase;
  mock.restoreAll();
});
test("IST and UTC windows align calendar midnight and hourly boundaries", () => {
  const now = new Date("2026-10-04T18:45:00Z");
  const ist = usageWindows(now);
  assert.equal(ist.day.toISOString(), "2026-10-04T18:30:00.000Z");
  assert.equal(ist.hour.toISOString(), "2026-10-04T18:30:00.000Z");
  assert.equal(ist.dayReset.toISOString(), "2026-10-05T18:30:00.000Z");
  process.env.THREAD_QUOTA_TIMEZONE = "UTC";
  const utc = usageWindows(now);
  assert.equal(utc.day.toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(utc.hourReset.toISOString(), "2026-10-04T19:00:00.000Z");
  process.env.THREAD_QUOTA_TIMEZONE = "unknown";
  assert.throws(() => usageWindows(now), UsageError);
});
test("exhausted budgets, disabled AI, and unavailable storage never call the provider", async () => {
  fakeDatabase(true);
  await assert.rejects(structureThought("Example", "workspace"), error => {
    const response = usageFailure(error);
    assert.equal(response?.status, 429); assert.ok(Number(response?.headers.get("retry-after")) > 0); return true;
  });
  process.env.THREAD_PUBLIC_AI_ENABLED = "false";
  await assert.rejects(structureThought("Example", "workspace"), UsageError);
  process.env.THREAD_PUBLIC_AI_ENABLED = "true";
  db.threadPrisma = { $transaction: async () => { throw new Error("Private database details"); } } as unknown as PrismaClient;
  await assert.rejects(structureThought("Example", "workspace"), error => error instanceof UsageError && error.status === 503 && !error.message.includes("Private"));
  assert.equal(calls, 0);
});
test("provider failure consumes its reservation and does not retry", async () => {
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 503 }); };
  await assert.rejects(structureThought("Example", "workspace"));
  assert.equal(calls, 1); assert.equal(used.get("structure:global"), 2); assert.equal(used.get("structure:workspace"), 2);
});
test("embedding budgets count actual chunks and empty candidates consume no inference", async () => {
  globalThis.fetch = async () => { calls++; return Response.json({ embeddings: [[1, ...Array(767).fill(0)]] }); };
  await embedTranscript("x".repeat(1500), "workspace");
  assert.equal(calls, 2); assert.equal(used.get("embed:global"), 4);
  assert.equal((await findThoughtConnection(structured, [], "workspace")).hasConnection, false);
  assert.equal(used.get("connect:global"), undefined);
});
test("private mode retains its existing provider behavior without counters", async () => {
  process.env.THREAD_ACCESS_MODE = "private";
  db.threadPrisma = { $transaction: async () => { throw new Error("Must not reserve privately"); } } as unknown as PrismaClient;
  await reserveProviderCall("structure", null);
  assert.deepEqual(await structureThought("Example"), structured);
});
export function wave(seconds: number) {
  const size = seconds * 16000 * 2, buffer = Buffer.alloc(44 + size);
  buffer.write("RIFF"); buffer.writeUInt32LE(36 + size, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(size, 40);
  return new File([buffer], "synthetic.wav", { type: "audio/wav" });
}
test("real FFmpeg keeps short audio, trims long audio, and rejects malformed input and timeout", async () => {
  assert.equal((await trimDemoAudio(wave(2))).size, 44 + 2 * 32000);
  const trimmed = await trimDemoAudio(wave(70));
  assert.equal(trimmed.size, 44 + 60 * 32000);
  const output = Buffer.from(await trimmed.arrayBuffer());
  assert.equal(output.readUInt32LE(24), 16000); assert.equal(output.readUInt16LE(22), 1);
  await assert.rejects(trimDemoAudio(new File(["not audio"], "invalid.wav")), error => error instanceof Error && "status" in error && error.status === 422);
  await assert.rejects(trimDemoAudio(wave(70), 1), error => error instanceof Error && "status" in error && error.status === 422);
});
test("invalid audio consumes nothing; transcription sends only bounded audio once", async () => {
  await assert.rejects(transcribeAudio(new File(["invalid"], "invalid.wav"), "workspace"));
  assert.equal(used.size, 0); assert.equal(calls, 0);
  globalThis.fetch = async (_url, init) => {
    calls++;
    const file = (init?.body as FormData).get("file") as File;
    assert.equal(file.size, 44 + 60 * 32000);
    return Response.json({ text: "Synthetic transcript" });
  };
  assert.equal(await transcribeAudio(wave(70), "workspace"), "Synthetic transcript");
  assert.equal(calls, 1); assert.equal(used.get("transcribe:global"), 2);
});
test("missing FFmpeg fails closed without reserving or sending audio", async () => {
  mock.method(process, "cwd", () => path.join(tmpdir(), `thread-no-decoder-${randomUUID()}`));
  await assert.rejects(transcribeAudio(wave(2), "workspace"), error => error instanceof Error && "status" in error && error.status === 503);
  assert.equal(used.size, 0); assert.equal(calls, 0);
});
