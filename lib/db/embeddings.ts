import "server-only";
import { z } from "zod";
import { getDatabase } from "./client";
import { embeddingVectorSchema } from "../embeddings/schemas";
import { EmbeddingError } from "../embeddings/errors";
import { requireWorkspaceScope } from "../workspace";

type EmbeddingSource = { rawTranscript: string; indexed: boolean; embeddingModel: string | null; embeddingVersion: number | null };

export async function getEmbeddingSource(id: string, workspace: string | null = null): Promise<EmbeddingSource | null> {
  requireWorkspaceScope(workspace);
  if (!z.uuid().safeParse(id).success) return null;
  const rows = await getDatabase().$queryRaw<EmbeddingSource[]>`
    SELECT "rawTranscript", "embedding" IS NOT NULL AS indexed, "embeddingModel", "embeddingVersion"
    FROM "Thought" WHERE id = ${id}::uuid
      AND "workspaceId" IS NOT DISTINCT FROM ${workspace}::text
  `;
  return rows[0] ?? null;
}

export async function storeEmbedding(id: string, vector: number[], model: string, version: number, workspace: string | null = null) {
  requireWorkspaceScope(workspace);
  if (!z.uuid().safeParse(id).success || !embeddingVectorSchema.safeParse(vector).success) {
    throw new EmbeddingError("Cannot store an invalid thought embedding.", 400);
  }
  // Values are bound parameters, including the serialized vector; never concatenate SQL.
  const count = await getDatabase().$executeRaw`
    UPDATE "Thought" SET embedding = ${JSON.stringify(vector)}::vector,
      "embeddingModel" = ${model}, "embeddingVersion" = ${version}
    WHERE id = ${id}::uuid
      AND "workspaceId" IS NOT DISTINCT FROM ${workspace}::text
      AND (embedding IS NULL OR "embeddingModel" IS DISTINCT FROM ${model} OR "embeddingVersion" IS DISTINCT FROM ${version})
  `;
  return count;
}

export async function listUnindexedThoughtIds(model: string, version: number, afterId?: string) {
  requireWorkspaceScope(null);
  return getDatabase().thought.findMany({
    where: {
      workspaceId: null,
      ...(afterId ? { id: { gt: afterId } } : {}),
      OR: [{ embeddingModel: null }, { embeddingModel: { not: model } }, { embeddingVersion: null }, { embeddingVersion: { not: version } }],
    },
    select: { id: true }, orderBy: { id: "asc" }, take: 50,
  });
}
