import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { listThoughts } from "../lib/db/thoughts";
import { getDatabase } from "../lib/db/client";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const ids: string[] = [randomUUID(), randomUUID(), randomUUID()];
  const titles = ids.map((id) => `Timeline verification ${id}`);
  const dates = [new Date("2000-01-01T00:00:00Z"), new Date("2000-01-02T00:00:00Z"), new Date("2000-01-02T00:00:00Z")];
  try {
    await db.thought.createMany({ data: ids.map((id, index) => ({
      id, title: titles[index], rawTranscript: "Synthetic timeline verification.",
      summary: "Temporary test thought.", categories: ["project"], actionable: false,
      createdAt: dates[index],
    })) });
    const expectedIds = [ids[1], ids[2]].sort().reverse().concat(ids[0]);
    const thoughts = await listThoughts();
    assert.deepEqual(thoughts.filter((thought) => ids.includes(thought.id)).map((thought) => thought.id), expectedIds);
    for (const path of ["/", "/thoughts"]) {
      const response = await fetch(`http://localhost:3000${path}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes("Your thoughts"));
      const positions = expectedIds.map((id) => html.indexOf(titles[ids.indexOf(id)]));
      assert.ok(positions.every((position) => position >= 0), "All fixture cards must render.");
      assert.ok(positions[0] < positions[1] && positions[1] < positions[2], "Cards must render in database order.");
    }
    console.log("Real database ordering, timestamp ties, and rendered cards verified on / and /thoughts.");
  } finally {
    await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Timeline verification failed. Start Thread on localhost:3000 and check PostgreSQL.");
  process.exitCode = 1;
});
