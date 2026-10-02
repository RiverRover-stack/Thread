import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Set DATABASE_URL in .env.local, then run npm run db:check again.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("PostgreSQL connection verified (SELECT 1). No data changed.");
  } catch (error) {
    // Avoid logging connection strings or server messages containing credentials.
    const code = typeof error.code === "string" ? error.code : "UNKNOWN";
    console.error(`PostgreSQL connection failed (${code}). Check DATABASE_URL and the database service.`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
