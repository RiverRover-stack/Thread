import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { getRelatedThoughts } from "../lib/db/thoughts";
import { indexThought } from "../lib/embeddings/index-thought";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const samples = [
    "I should benchmark inference latency and peak memory use of the compressed model on a Raspberry Pi.",
    "I want to buy vegetables at the market and cook dinner tomorrow.",
    "Measure how quickly the smaller neural network runs and how much RAM it needs on the Raspberry Pi.",
    "Measure how quickly the smaller neural network runs and how much RAM it needs on the Raspberry Pi. ".repeat(25),
  ];
  try {
    for (const [index, id] of ids.entries()) {
      await db.thought.create({ data: { id, rawTranscript: samples[index], title: `Semantic evaluation ${index}`, summary: "Synthetic evaluation thought.", categories: ["project"], actionable: false, createdAt: new Date(index < 2 ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z") } });
      await indexThought(id);
    }
    for (const index of [2, 3]) {
      const matches = await getRelatedThoughts(ids[index]);
      const relevant = matches?.find((row) => row.id === ids[0]);
      const unrelated = matches?.find((row) => row.id === ids[1]);
      console.log(`${index === 2 ? "Paraphrase" : "Long transcript"}: relevant score ${relevant?.similarity.toFixed(3) ?? "below threshold"}; unrelated ${unrelated ? "returned" : "excluded"}.`);
      assert.ok(relevant, "Related paraphrase must pass the configured threshold.");
      assert.equal(unrelated, undefined, "Unrelated thought should be excluded.");
    }
    console.log("Synthetic semantic quality checks passed. Review your own examples before treating the threshold as calibrated.");
  } finally {
    await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Memory evaluation failed. Check local inference and review the configured similarity threshold.");
  process.exitCode = 1;
});
