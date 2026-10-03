CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Thought"
  ADD COLUMN "embedding" vector(768),
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "embeddingVersion" INTEGER;

ALTER TABLE "Thought" ADD CONSTRAINT "Thought_embedding_metadata_check" CHECK (
  ("embedding" IS NULL AND "embeddingModel" IS NULL AND "embeddingVersion" IS NULL)
  OR
  ("embedding" IS NOT NULL AND "embeddingModel" IS NOT NULL AND "embeddingVersion" IS NOT NULL)
);
