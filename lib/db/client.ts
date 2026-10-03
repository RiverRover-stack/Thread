import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForDatabase = globalThis as unknown as { threadPrisma?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (globalForDatabase.threadPrisma) return globalForDatabase.threadPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_NOT_CONFIGURED");

  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 });
  const client = new PrismaClient({ adapter });
  // Hot reload must reuse the pool rather than opening new connections repeatedly.
  globalForDatabase.threadPrisma = client;
  return client;
}
