import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const flags = process.argv.slice(2);
if (flags.some((flag) => !["--database", "--embedding"].includes(flag))) {
  console.error("Usage: node scripts/check-semantic-memory.mjs [--database | --embedding]");
  process.exit(1);
}

const EXPECTED_DIMENSIONS = 768;
// CHALLENGE: Try a different sample to see that different text has the same vector shape.
// TODO(you): Edit only this string. Hint 1: keep the quotes. Hint 2: use a short
// sentence. Hint 3: the numbers may change, but the dimension count should not.
// Verify: npm run memory:check:embedding must still report 768 dimensions.
// An embedding is an array of numbers representing meaning, not a generated summary.
const sampleText = "Build a user facing stress detection project and include the model.";

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
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "embeddinggemma:300m";
  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: `task: sentence similarity | query: ${sampleText}`,
        dimensions: EXPECTED_DIMENSIONS,
        truncate: false,
        keep_alive: "5m",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      console.error(response.status === 404
        ? "Embedding: model missing. Run ollama pull embeddinggemma:300m, or check OLLAMA_EMBEDDING_MODEL."
        : `Embedding: Ollama returned HTTP ${response.status}. Check local model configuration.`);
      return false;
    }
    const result = await response.json();
    const vectors = result?.embeddings;
    const vector = Array.isArray(vectors) && vectors.length === 1 ? vectors[0] : null;
    if (!Array.isArray(vector) || vector.length !== EXPECTED_DIMENSIONS
      || !vector.every((value) => typeof value === "number" && Number.isFinite(value))
      || !vector.some((value) => value !== 0)) {
      console.error("Embedding: expected one nonzero vector containing 768 finite numbers.");
      return false;
    }
    console.log("Embedding: local model returned one valid 768-dimensional vector. No transcript or vector logged or saved.");
    return true;
  } catch (error) {
    console.error(error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "Embedding: inference timed out. Keep Ollama running and retry; the first model load can be slower."
      : "Embedding: could not obtain a valid response. Check Ollama and OLLAMA_BASE_URL, then retry.");
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
