import nextEnv from "@next/env";
import pg from "pg";
import { createRequire } from "node:module";

// tsx registers TypeScript require hooks; use one module format for shared classes.
const require = createRequire(import.meta.url);
const { embedText } = require("../lib/embeddings/index.ts");
const { embeddingModelName } = require("../lib/embeddings/config.ts");
const { EmbeddingError } = require("../lib/embeddings/errors.ts");

nextEnv.loadEnvConfig(process.cwd());

const flags = process.argv.slice(2);
if (flags.some((flag) => !["--database", "--embedding"].includes(flag))) {
  console.error("Usage: npm run memory:check -- [--database | --embedding]");
  process.exit(1);
}

const EXPECTED_DIMENSIONS = 768;

const sampleText = "I want to benchmark my compressed model on a Raspberry Pi.";

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("Database: set DATABASE_URL in .env.local before checking vector support.");
    return false;
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    await client.connect();
    // This transaction cannot create an extension, change a table, or write thoughts.
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(
      "SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'",
    );
    if (!rows.length) {
      console.error("Database: pgvector files are missing from this PostgreSQL installation. Follow README's Windows setup.");
      return false;
    }
    if (!rows[0].installed_version) {
      console.error("Database: pgvector is available but not enabled in this database. Enable it using README's setup step.");
      return false;
    }
    const result = await client.query("SELECT '[1,0,0]'::vector <=> '[1,0,0]'::vector AS distance");
    if (Number(result.rows[0]?.distance) !== 0) {
      console.error("Database: the pgvector cosine-distance check returned an unexpected result.");
      return false;
    }
    console.log(`Database: pgvector ${rows[0].installed_version} enabled; cosine distance verified. No data changed.`);
    return true;
  } catch (error) {
    // Never print PostgreSQL messages or connection strings: they can contain secrets.
    const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    console.error(`Database: readiness check failed (${code}). Check PostgreSQL, DATABASE_URL, and pgvector setup.`);
    return false;
  } finally {
    // Closing the connection rolls back the read-only transaction, including on failure.
    await client.end();
  }
}

async function checkEmbedding() {
  try {
    // Use the application's adapter so readiness checks validate the selected provider.
    const vector = await embedText(sampleText);
    if (vector.length !== EXPECTED_DIMENSIONS) throw new Error("INVALID_DIMENSIONS");
    console.log(`Embedding: ${embeddingModelName()} returned one valid 768-dimensional vector. No transcript or vector logged or saved.`);
    return true;
  } catch (error) {
    console.error(error instanceof EmbeddingError
      ? `Embedding: ${error.message}`
      : "Embedding: readiness check failed. Check the selected provider configuration.");
    return false;
  }
}
async function main() {
  let ready = true;
  if (!flags.length || flags.includes("--database")) ready = await checkDatabase() && ready;
  if (!flags.length || flags.includes("--embedding")) ready = await checkEmbedding() && ready;
  if (!ready) process.exitCode = 1;
}

void main().catch(() => {
  console.error("Semantic-memory readiness check failed. Check README's setup instructions.");
  process.exitCode = 1;
});
