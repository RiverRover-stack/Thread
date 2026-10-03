import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { chunkTranscript, embedTranscript } from "../lib/embeddings/transcript";
import { EmbeddingError } from "../lib/embeddings/errors";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.OLLAMA_BASE_URL;
const originalModel = process.env.OLLAMA_EMBEDDING_MODEL;
const prefix = "task: sentence similarity | query: ";
const vector = (first: number, second = 0) => [first, second, ...Array<number>(766).fill(0)];

beforeEach(() => {
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  process.env.OLLAMA_EMBEDDING_MODEL = "embeddinggemma:300m";
  globalThis.fetch = async () => { throw new Error("Unexpected embedding call"); };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = originalBaseUrl;
  if (originalModel === undefined) delete process.env.OLLAMA_EMBEDDING_MODEL;
  else process.env.OLLAMA_EMBEDDING_MODEL = originalModel;
});

test("keeps short transcripts intact and respects the exact byte boundary", () => {
  const short = "  Learn APIs.\nKeep my spaces.  ";
  assert.deepEqual(chunkTranscript(short), [short]);
  assert.deepEqual(chunkTranscript("a".repeat(1000)), ["a".repeat(1000)]);
  assert.deepEqual(chunkTranscript("a".repeat(1001)), ["a".repeat(1000), "a".repeat(101)]);
  assert.deepEqual(chunkTranscript("🙂".repeat(250)), ["🙂".repeat(250)]);
  assert.deepEqual(chunkTranscript("🙂".repeat(251)), ["🙂".repeat(250), "🙂".repeat(26)]);
});

test("covers every character with bounded chunks and overlap, including multilingual text", () => {
  const cases = [
    "0123456789".repeat(1000),
    "नमस्ते🙂 café\n".repeat(160),
    "汉字🚀 e\u0301\n".repeat(200),
    "a".repeat(998) + "🙂" + "界".repeat(700),
  ];
  for (const transcript of cases) {
    const chunks = chunkTranscript(transcript);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.length < 50, "Chunking must make forward progress.");
    let covered = 0;
    for (const [index, chunk] of chunks.entries()) {
      assert.ok(Buffer.byteLength(chunk, "utf8") <= 1000);
      assert.equal(chunk.isWellFormed(), true, "No broken surrogate pairs.");
      let start = covered;
      if (index > 0) {
        const previous = Array.from(chunks[index - 1]);
        let overlap = "";
        for (let position = previous.length - 1; position >= 0; position -= 1) {
          const candidate = previous[position] + overlap;
          if (Buffer.byteLength(candidate, "utf8") > 100) break;
          overlap = candidate;
        }
        assert.ok(Buffer.byteLength(overlap, "utf8") <= 100);
        assert.ok(chunk.startsWith(overlap));
        start -= overlap.length;
      }
      assert.equal(transcript.slice(start, start + chunk.length), chunk);
      assert.ok(start + chunk.length > covered, "Every chunk contributes new text.");
      covered = start + chunk.length;
    }
    assert.equal(covered, transcript.length, "Nothing at the end is dropped.");
  }
});

test("embeds chunks sequentially with one task prefix and normalizes their mean", async () => {
  const transcript = "A".repeat(1000) + "B".repeat(900);
  const inputs: string[] = [];
  let active = 0;
  let maximumActive = 0;
  globalThis.fetch = async (_input, options) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.truncate, false);
    assert.equal(body.dimensions, 768);
    inputs.push(body.input);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return Response.json({ embeddings: [inputs.length === 1 ? vector(1, 0) : vector(0, 1)] });
  };
  const result = await embedTranscript(transcript);
  assert.deepEqual(inputs, [prefix + "A".repeat(1000), prefix + "A".repeat(100) + "B".repeat(900)]);
  assert.equal(maximumActive, 1);
  assert.equal(result.length, 768);
  assert.ok(Math.abs(result[0] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(result[1] - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...result) - 1) < 1e-12);
  assert.equal(transcript, "A".repeat(1000) + "B".repeat(900));
});

test("normalizes a single chunk and skips meaningless whitespace chunks", async () => {
  const inputs: string[] = [];
  globalThis.fetch = async (_input, options) => {
    inputs.push(JSON.parse(String(options?.body)).input);
    return Response.json({ embeddings: [vector(3, 4)] });
  };
  assert.deepEqual((await embedTranscript("A short thought")).slice(0, 2), [0.6, 0.8]);
  const result = await embedTranscript(" ".repeat(2000) + "Meaningful ending.");
  assert.equal(inputs.length, 2);
  assert.ok(inputs[1].endsWith("Meaningful ending."));
  assert.ok(Math.abs(Math.hypot(...result) - 1) < 1e-12);
});

test("rejects empty and oversized input before any provider calls", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ embeddings: [vector(1)] }); };
  for (const text of ["", " \n\t ", "x".repeat(10001), null, 42]) {
    await assert.rejects(embedTranscript(text as string), (error: unknown) => error instanceof EmbeddingError && error.status === 400);
  }
  assert.equal(calls, 0);
});

test("stops on a failed chunk instead of returning a partial transcript vector", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? Response.json({ embeddings: [vector(1)] }) : new Response("private detail", { status: 500 });
  };
  await assert.rejects(embedTranscript("a".repeat(2800)), (error: unknown) => error instanceof EmbeddingError && error.status === 502);
  assert.equal(calls, 2);
});

test("rejects cancellation to a zero mean instead of dividing by zero", async () => {
  let calls = 0;
  globalThis.fetch = async () => Response.json({ embeddings: [vector(++calls === 1 ? 1 : -1)] });
  await assert.rejects(embedTranscript("a".repeat(1900)), (error: unknown) => {
    assert.ok(error instanceof EmbeddingError);
    assert.equal(error.status, 502);
    assert.match(error.message, /nonzero transcript embedding/);
    return true;
  });
});
