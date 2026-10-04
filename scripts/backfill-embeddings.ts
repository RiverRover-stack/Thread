import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { listUnindexedThoughtIds } from "../lib/db/embeddings";
import { indexThought } from "../lib/embeddings/index-thought";
import { embeddingModelName } from "../lib/embeddings/config";
import { EMBEDDING_RECIPE_VERSION } from "../lib/embeddings/transcript";

loadEnvConfig(process.cwd());

async function main() {
  let afterId: string | undefined;
  let indexed = 0;
  let reused = 0;
  let failed = 0;
  try {
    while (true) {
      const rows = await listUnindexedThoughtIds(embeddingModelName(), EMBEDDING_RECIPE_VERSION, afterId);
      if (!rows.length) break;
      for (const { id } of rows) {
        afterId = id;
        try {
          const result = await indexThought(id);
          if (!result) continue;
          if (result.reused) reused += 1;
          else indexed += 1;
        } catch {
          failed += 1;
        }
      }
      console.log(`Backfill: indexed ${indexed}, reused ${reused}, failed ${failed}.`);
    }
    console.log(`Backfill finished: indexed ${indexed}, reused ${reused}, failed ${failed}. No thought content logged.`);
    if (failed) process.exitCode = 1;
  } finally {
    await getDatabase().$disconnect();
  }
}

void main().catch(() => {
  console.error("Embedding backfill failed. Check PostgreSQL, migrations, and the selected embedding provider, then rerun to resume.");
  process.exitCode = 1;
});
