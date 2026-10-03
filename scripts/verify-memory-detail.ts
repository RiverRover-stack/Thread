import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const ids = [randomUUID(), randomUUID()];
  const transcripts = ["Benchmark the compressed model's inference latency and memory usage on a Raspberry Pi.", "Measure how fast the compressed model runs and how much RAM it needs on the Raspberry Pi."];
  try {
    for (const [index, id] of ids.entries()) {
      await db.thought.create({ data: { id, rawTranscript: transcripts[index], title: `Memory detail fixture ${index}`, summary: "Benchmark inference latency and memory use on Raspberry Pi.", categories: ["project"], actionable: true,
        createdAt: new Date(index === 0 ? "2026-01-01T00:00:00Z" : "2026-01-02T00:00:00Z") } });
      const page = await fetch(`http://localhost:3000/thoughts/${id}`);
      assert.equal(page.status, 200);
      const html = await page.text();
      for (const text of ["USER SAID", "AI INTERPRETED", "Related thoughts", "Preparing semantic memory"]) assert.ok(html.includes(text));
      assert.ok(html.includes(transcripts[index]));
      const response = await fetch(`http://localhost:3000/api/thoughts/${id}/embedding`, { method: "POST" });
      assert.equal(response.status, 200);
      const confirmation = await response.json();
      assert.equal(confirmation.indexed, true);
      assert.ok(!("embedding" in confirmation));
    }
    const response = await fetch(`http://localhost:3000/api/thoughts/${ids[1]}/related`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.relatedThoughts.some((thought: { id: string }) => thought.id === ids[0]));
    assert.ok(!result.relatedThoughts.some((thought: { id: string }) => thought.id === ids[1]));
    assert.equal((await db.thought.findUnique({ where: { id: ids[1] } }))?.rawTranscript, transcripts[1]);
    for (const suffix of ["embedding", "related"]) {
      assert.equal((await fetch(`http://localhost:3000/api/thoughts/invalid-id/${suffix}`, { method: suffix === "embedding" ? "POST" : "GET" })).status, 404);
    }
    console.log("Real detail content, asynchronous section, indexing/retrieval endpoints, related match, self exclusion, and transcript preservation verified.");
  } finally {
    await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Memory detail verification failed. Start Thread on localhost:3000 and check PostgreSQL/Ollama.");
  process.exitCode = 1;
});
