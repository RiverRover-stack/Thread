import "server-only";
import { EmbeddingError } from "./errors";
import { embeddingModelName } from "./config";
import { EMBEDDING_DIMENSIONS, embeddingInputSchema, embeddingResponseSchema } from "./schemas";

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function embedWithOllama(text: string): Promise<number[]> {
  if (!embeddingInputSchema.safeParse(text).success) {
    throw new EmbeddingError("Provide nonempty text to embed.", 400);
  }
  const baseUrl = (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = embeddingModelName();

  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: `task: sentence similarity | query: ${text}`,
        dimensions: EMBEDDING_DIMENSIONS,
        truncate: false,
        keep_alive: "5m",
      }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new EmbeddingError(
          "The local embedding model is unavailable. Run \"ollama pull embeddinggemma:300m\", or check OLLAMA_EMBEDDING_MODEL, then retry.",
          503,
        );
      }
      if (response.status === 400 || response.status === 413 || response.status === 422) {
        throw new EmbeddingError("The local embedding model rejected the input. Try shorter text and check the embedding configuration.", 422);
      }
      if (response.status === 429) {
        throw new EmbeddingError("The local embedding server is busy. Please retry shortly.", 429);
      }
      throw new EmbeddingError("The local embedding model could not process this text. Please retry.", 502);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch (error) {
      if (isTimeout(error)) throw error;
      throw new EmbeddingError("The local embedding model returned an unreadable response. Please retry.", 502);
    }
    const validated = embeddingResponseSchema.safeParse(result);
    if (!validated.success) {
      throw new EmbeddingError("The local embedding model returned an invalid vector. Please retry.", 502);
    }
    return validated.data.embeddings[0];
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    if (isTimeout(error)) {
      throw new EmbeddingError("Local embedding inference took too long. Keep Ollama running and retry.", 504);
    }
    throw new EmbeddingError("Could not reach Ollama for embeddings. Start Ollama and check OLLAMA_BASE_URL, then retry.", 503);
  }
}
