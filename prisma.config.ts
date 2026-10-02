import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

// Use the same .env.local loading rules as the Next.js application.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
