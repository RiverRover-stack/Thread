import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { storeEmbedding } from "../lib/db/embeddings";
import { getRelatedThoughts } from "../lib/db/thoughts";
import { embeddingModelName } from "../lib/embeddings/config";
import { EMBEDDING_RECIPE_VERSION } from "../lib/embeddings/transcript";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const ids = Array.from({ length: 12 }, () => randomUUID());
  const originalThreshold = process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
  process.env.RELATED_THOUGHTS_MIN_SIMILARITY = "0.70";
  // A high unused coordinate isolates synthetic fixtures from ordinary model vectors.
  const controlled = (score: number) => [...Array<number>(766).fill(0), score, Math.sqrt(1 - score * score)];
  try {
    for (const [index, id] of ids.entries()) {
      await db.thought.create({ data: { id, rawTranscript: "Synthetic retrieval verification.", title: `Retrieval fixture ${index}`, summary: "Temporary fixture.", categories: ["project"], actionable: false,
        createdAt: new Date(index === 0 || index === 9 ? "2026-01-10T00:00:00Z" : index === 8 ? "2026-01-11T00:00:00Z" : "2026-01-01T00:00:00Z") } });
      if (index === 10) continue;
      await storeEmbedding(id, controlled(index === 0 || index >= 8 ? 1 : index === 7 ? 0.69 : 0.8 + index * 0.02), index === 11 ? "incompatible-model" : embeddingModelName(), EMBEDDING_RECIPE_VERSION);
    }
    const related = await getRelatedThoughts(ids[0]);
    assert.deepEqual(related?.map((thought) => thought.id), [ids[6], ids[5], ids[4], ids[3], ids[2]]);
    for (const row of related ?? []) {
      assert.ok(row.similarity >= 0.7);
      assert.ok(!("embedding" in row));
    }
    process.env.RELATED_THOUGHTS_MIN_SIMILARITY = "1";
    assert.deepEqual(await getRelatedThoughts(ids[0]), []);
    assert.equal(await getRelatedThoughts(randomUUID()), null);
    console.log("Real pgvector ranking, five-result limit, threshold, earlier-time/self/model/unindexed exclusions verified.");
  } finally {
    if (originalThreshold === undefined) delete process.env.RELATED_THOUGHTS_MIN_SIMILARITY;
    else process.env.RELATED_THOUGHTS_MIN_SIMILARITY = originalThreshold;
    await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Related-thought verification failed. Check PostgreSQL and migrations.");
  process.exitCode = 1;
});
