import { z } from "zod";

export const EMBEDDING_DIMENSIONS = 768;

export const embeddingVectorSchema = z.array(z.number().finite())
  .length(EMBEDDING_DIMENSIONS)
  .refine((vector) => {
    if (vector.length !== EMBEDDING_DIMENSIONS) return false;
    const magnitude = Math.hypot(...vector);
    return Number.isFinite(magnitude) && magnitude > 0;
  }, "The embedding must have a finite, nonzero magnitude.");

// Ollama also returns timing metadata; only the vector is part of our contract.
export const embeddingResponseSchema = z.object({
  embeddings: z.array(embeddingVectorSchema).length(1),
});

export const embeddingInputSchema = z.string()
  .refine((text) => text.trim().length > 0, "Provide nonempty text to embed.");
