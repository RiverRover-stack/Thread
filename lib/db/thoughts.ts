import "server-only";
import { getDatabase } from "./client";
import { z } from "zod";
import { getEmbeddingSource } from "./embeddings";
import { embeddingModelName } from "../embeddings/config";
import { EMBEDDING_RECIPE_VERSION } from "../embeddings/transcript";
import { EmbeddingError } from "../embeddings/errors";
import { recordCandidateCount, traceOperation } from "../observability/trace";

export const thoughtContentSelect = {
  id: true, rawTranscript: true, title: true, summary: true, categories: true,
  actionable: true, possibleAction: true, questionToExplore: true, createdAt: true,
} as const;

export async function listThoughts() {
  return getDatabase().thought.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, summary: true, categories: true, createdAt: true },
  });
}

export async function getThought(id: string) {
  // URL parameters are external input. Invalid UUIDs should be a 404, not a SQL error.
  if (!z.uuid().safeParse(id).success) return null;
  return getDatabase().thought.findUnique({ where: { id }, select: thoughtContentSelect });
}

export type RelatedThought = {
  id: string; title: string; summary: string; createdAt: Date; similarity: number;
};

export async function getRelatedThoughts(id: string): Promise<RelatedThought[] | null> {
  return traceOperation("retrieve", {
    "gen_ai.operation.name": "execute_tool", "gen_ai.operation.type": "tool", "gen_ai.tool.name": "retrieve",
  }, async () => {
    const result = await retrieveRelatedThoughts(id);
    if (result) recordCandidateCount(result.length);
    return result;
  });
}

async function retrieveRelatedThoughts(id: string): Promise<RelatedThought[] | null> {
  const source = await getEmbeddingSource(id);
  if (!source) return null;
  const model = embeddingModelName();
  if (!source.indexed || source.embeddingModel !== model || source.embeddingVersion !== EMBEDDING_RECIPE_VERSION) {
    throw new EmbeddingError("Prepare semantic memory for this thought before retrieving related thoughts.", 409);
  }
  const configured = process.env.RELATED_THOUGHTS_MIN_SIMILARITY?.trim();
  const threshold = configured ? Number(configured) : 0.70;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new EmbeddingError("Set RELATED_THOUGHTS_MIN_SIMILARITY to a number between 0 and 1, then restart Thread.", 503);
  }
  return getDatabase().$queryRaw<RelatedThought[]>`
    SELECT related.id, related.title, related.summary, related."createdAt",
      LEAST(1.0, GREATEST(-1.0, 1 - (related.embedding <=> current.embedding)))::double precision AS similarity
    FROM "Thought" current JOIN "Thought" related
      ON related.id <> current.id AND related."createdAt" < current."createdAt"
    WHERE current.id = ${id}::uuid
      AND related.embedding IS NOT NULL
      AND related."embeddingModel" = ${model}
      AND related."embeddingVersion" = ${EMBEDDING_RECIPE_VERSION}
      AND 1 - (related.embedding <=> current.embedding) >= ${threshold}
    ORDER BY similarity DESC, related."createdAt" DESC, related.id ASC
    LIMIT 5
  `;
}
