import assert from "node:assert/strict";
import { test } from "node:test";
import { indexingResponseSchema, relatedThoughtsResponseSchema } from "../lib/embeddings/response-schemas";

const id = "bf375e93-6ff1-4cba-bcf1-574465e949ea";
const card = { id, title: "A related thought", summary: "Earlier thought summary", createdAt: "2026-01-01T00:00:00.000Z", similarity: 0.75 };

test("accepts valid memory confirmation, empty matches and card responses", () => {
  assert.equal(indexingResponseSchema.safeParse({ id, indexed: true, reused: false }).success, true);
  assert.equal(relatedThoughtsResponseSchema.safeParse({ relatedThoughts: [] }).success, true);
  assert.equal(relatedThoughtsResponseSchema.safeParse({ relatedThoughts: [card] }).success, true);
});

test("rejects unsafe IDs, invalid dates, malformed scores and accidental vector exposure", () => {
  for (const change of [{ id: "javascript:alert(1)" }, { createdAt: "invalid" }, { similarity: "0.75" }, { similarity: Infinity }, { embedding: [1] }]) {
    assert.equal(relatedThoughtsResponseSchema.safeParse({ relatedThoughts: [{ ...card, ...change }] }).success, false);
  }
  assert.equal(relatedThoughtsResponseSchema.safeParse({ relatedThoughts: Array(6).fill(card) }).success, false);
  assert.equal(indexingResponseSchema.safeParse({ id, indexed: false, reused: false }).success, false);
});
