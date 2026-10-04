import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { indexThought } from "../lib/embeddings/index-thought";
import { getEmbeddingSource } from "../lib/db/embeddings";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const existingId = process.argv[2];
  const id = existingId || randomUUID();
  const rawTranscript = "  Benchmark the compressed model on a Raspberry Pi.\nKeep this original wording.  ";
  try {
    if (existingId) {
      assert.equal((await getEmbeddingSource(id))?.indexed, true);
      const rows = await db.$queryRaw<{ dimensions: number }[]>`SELECT vector_dims(embedding) AS dimensions FROM "Thought" WHERE id = ${id}::uuid`;
      assert.equal(rows[0]?.dimensions, 768);
      console.log("Stored embedding verified in a separate process.");
      return;
    }
    await db.thought.create({ data: { id, rawTranscript, title: "Temporary embedding check", summary: "Benchmark a compressed model.", categories: ["project"], actionable: true, possibleAction: "Benchmark the model.", questionToExplore: null } });
    assert.equal((await indexThought(id))?.reused, false);
    assert.equal((await indexThought(id))?.reused, true);
    assert.equal((await db.thought.findUnique({ where: { id } }))?.rawTranscript, rawTranscript);
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/verify-embeddings.ts", id], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(child.status, 0, "Separate-process embedding read must succeed.");
    console.log("Embedding write, retry reuse, exact transcript preservation, and separate-process persistence verified.");
  } finally {
    if (!existingId) await db.thought.deleteMany({ where: { id } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Embedding persistence verification failed. Check PostgreSQL, migrations, and the selected embedding provider.");
  process.exitCode = 1;
});
