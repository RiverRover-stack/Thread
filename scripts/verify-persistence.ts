import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import assert from "node:assert/strict";
import { POST } from "../app/api/thoughts/route";
import { getDatabase } from "../lib/db/client";

loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env.local first.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
  try {
    const existingId = process.argv[2];
    if (existingId) {
      const thought = await db.thought.findUnique({ where: { id: existingId } });
      if (!thought) throw new Error("Thought not found.");
      console.log("Stored thought read successfully from a fresh process:");
      console.log(JSON.stringify(thought, null, 2));
    } else {
      const id = randomUUID();
      const rawTranscript = "  Persistence verification.\nKeep these spaces.  ";
      const structuredThought = {
        title: "Persistence Verification", summary: "A synthetic database verification thought.",
        categories: ["project"], actionable: false, possibleAction: null, questionToExplore: null,
      };
      const payload = { id, rawTranscript, structuredThought };
      const request = () => new Request("http://localhost/api/thoughts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await POST(request());
        assert.equal(response.status, 200, "The save route must confirm success.");
        const { thought } = await response.json();
        assert.equal(thought.rawTranscript, rawTranscript);
        for (const [key, value] of Object.entries(structuredThought)) {
          assert.deepEqual(thought[key], value);
        }
      }
      assert.equal(await db.thought.count({ where: { id } }), 1, "Retries must leave exactly one row.");
      console.log("Save route, exact transcript preservation, all AI fields, and duplicate prevention verified.");
      console.log("Created one synthetic verification thought. It is intentionally kept for the restart check.");
      console.log(`Run in a fresh terminal: npm run db:verify -- ${id}`);
    }
  } finally {
    await db.$disconnect();
    await getDatabase().$disconnect();
  }
}

void main().catch(() => {
  console.error("Persistence verification failed. Check DATABASE_URL, PostgreSQL, migrations, and the thought ID.");
  process.exitCode = 1;
});
