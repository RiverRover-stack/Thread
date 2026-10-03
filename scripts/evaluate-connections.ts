import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { findThoughtConnection } from "../lib/ai";
import { getThoughtConnection } from "../lib/ai/thought-connection";
import { getDatabase } from "../lib/db/client";
import { getRelatedThoughts } from "../lib/db/thoughts";
import { indexThought } from "../lib/embeddings/index-thought";
import type { StructuredThought } from "../lib/ai/schemas";
import { z } from "zod";

loadEnvConfig(process.cwd());

function thought(summary: string, title: string, categories: string[], possibleAction: string | null = null): StructuredThought {
  return { title, summary, categories, actionable: possibleAction !== null, possibleAction, questionToExplore: null };
}

const cases = [
  {
    name: "A — useful connection", expected: true,
    previous: thought("My portfolio needs stronger evidence that knowledge distillation improves deployment.", "Deployment evidence", ["project"]),
    current: thought("I should benchmark the compressed model on Raspberry Pi.", "Device benchmark", ["project"], "Benchmark the compressed model on Raspberry Pi."),
  },
  {
    name: "B — superficial overlap", expected: false,
    previous: thought("I saw a photo of a red rose in a gardening magazine.", "Rose photograph", ["personal"]),
    current: thought("I saw a photo of a yellow tulip in a gardening magazine.", "Tulip photograph", ["personal"]),
  },
  {
    name: "C — unrelated", expected: false,
    previous: thought("I should benchmark the compressed model on Raspberry Pi.", "Device benchmark", ["project"], "Benchmark the compressed model on Raspberry Pi."),
    current: thought("I want to buy carrots and cook soup tomorrow.", "Soup for dinner", ["personal"], "Buy carrots and cook soup tomorrow."),
  },
];

async function main() {
  if (process.argv.includes("--cleanup-fixtures")) {
    const ids = process.argv.slice(process.argv.indexOf("--cleanup-fixtures") + 1);
    assert.equal(ids.length, 2, "Supply only the two IDs printed by --keep-fixtures.");
    for (const id of ids) z.uuid().parse(id);
    const db = getDatabase();
    try {
      const result = await db.thought.deleteMany({ where: {
        id: { in: ids }, title: { in: ["Deployment evidence", "Device benchmark"] },
        createdAt: { in: [new Date("2000-01-01T00:00:00Z"), new Date("2000-01-02T00:00:00Z")] },
      } });
      console.log(`Removed ${result.count} evaluation fixtures.`);
    } finally {
      await db.$disconnect();
    }
    return;
  }
  const failures: string[] = [];
  for (const sample of process.argv.includes("--integration-only") ? [] : cases) {
    const result = await findThoughtConnection(sample.current, [sample.previous]);
    console.log(`${sample.name}: ${JSON.stringify(result)}`);
    if (result.hasConnection !== sample.expected) failures.push(sample.name);
    if (sample.expected && result.hasConnection) assert.match(`${result.connection} ${result.implication}`, /deploy|evidence|portfolio|benchmark/i);
  }
  assert.equal(failures.length, 0, `Unexpected model decisions: ${failures.join(", ")}`);

  // Real storage/retrieval check uses only our own disposable records.
  const db = getDatabase();
  const ids = [randomUUID(), randomUUID()];
  const sample = {
    previous: thought("My portfolio comparison of a compressed model on Raspberry Pi needs stronger evidence that knowledge distillation improves deployment, rather than only reporting model size.", "Deployment evidence", ["project"]),
    current: thought("I should benchmark the compressed model on Raspberry Pi to measure its deployment performance.", "Device benchmark", ["project"], "Benchmark the compressed model on Raspberry Pi."),
  };
  let keep = false;
  try {
    for (const [index, content] of [sample.previous, sample.current].entries()) {
      await db.thought.create({ data: {
        id: ids[index], ...content, rawTranscript: content.summary,
        createdAt: new Date(index === 0 ? "2000-01-01T00:00:00Z" : "2000-01-02T00:00:00Z"),
      } });
      await indexThought(ids[index]);
    }
    const candidates = await getRelatedThoughts(ids[1]);
    console.log(`Real retrieval: ${JSON.stringify(candidates)}`);
    assert.ok(candidates);
    assert.ok(candidates.some((candidate) => candidate.id === ids[0]), "The useful previous thought must pass the existing retrieval threshold.");
    assert.ok(!candidates.some((candidate) => candidate.id === ids[1]));
    const result = await getThoughtConnection(ids[1]);
    console.log(`Real orchestration: ${JSON.stringify(result)}`);
    assert.equal(result?.hasConnection, true);
    assert.equal((await db.thought.findUnique({ where: { id: ids[1] } }))?.rawTranscript, sample.current.summary);
    keep = process.argv.includes("--keep-fixtures");
    if (keep) console.log(`Browser fixtures retained: ${JSON.stringify(ids)}\nOpen http://localhost:3000/thoughts/${ids[1]}`);
    console.log("Connection quality cases, real retrieval, orchestration, and transcript preservation passed.");
  } finally {
    if (!keep) await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Connection evaluation failed.");
  process.exitCode = 1;
});
