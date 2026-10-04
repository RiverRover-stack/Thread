import "server-only";
import { z } from "zod";
import { EmbeddingError } from "./errors";
import { GOOGLE_EMBEDDING_MODEL } from "./config";
import { EMBEDDING_DIMENSIONS, embeddingInputSchema, embeddingVectorSchema } from "./schemas";

const responseSchema = z.object({
  embedding: z.object({ values: embeddingVectorSchema }),
});

export async function embedWithGoogle(text: string): Promise<number[]> {
  if (!embeddingInputSchema.safeParse(text).success) {
    throw new EmbeddingError("Provide nonempty text to embed.", 400);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new EmbeddingError("Set GEMINI_API_KEY on the server to use hosted embeddings.", 503);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: `models/${GOOGLE_EMBEDDING_MODEL}`,
          // Compare thoughts symmetrically: apply the same task prefix to each.
          content: { parts: [{ text: `task: sentence similarity | query: ${text}` }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
        redirect: "error",
      },
    );
    if (!response.ok) {
      if (response.status === 429) throw new EmbeddingError("Hosted embeddings reached their quota. Wait and retry, or check AI Studio limits.", 429);
      if ([400, 401, 403, 404].includes(response.status)) {
        throw new EmbeddingError("Hosted embedding configuration was rejected. Check the server API key and model access.", 503);
      }
      if ([413, 422].includes(response.status)) throw new EmbeddingError("The hosted embedding model rejected the input. Try shorter text.", 422);
      throw new EmbeddingError("The hosted embedding model could not process this text. Please retry.", 502);
    }
    const result = responseSchema.safeParse(await response.json());
    if (!result.success) throw new EmbeddingError("The hosted embedding model returned an invalid vector. Please retry.", 502);
    return result.data.embedding.values;
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new EmbeddingError("Hosted embedding inference took too long. Please retry.", 504);
    }
    if (error instanceof SyntaxError) throw new EmbeddingError("The hosted embedding model returned an unreadable response. Please retry.", 502);
    // Never include provider bodies, keys, or input text in application errors.
    throw new EmbeddingError("Could not reach the hosted embedding model. Please retry.", 503);
  }
}
