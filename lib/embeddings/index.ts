import "server-only";
import { embedWithOllama } from "./ollama";
import { embedWithGoogle } from "./google";
import { embeddingProvider, embeddingModelName, GOOGLE_EMBEDDING_MODEL } from "./config";
import { traceOperation } from "../observability/trace";

export async function embedText(text: string): Promise<number[]> {
  const selected = embeddingProvider();
  return traceOperation("embed", {
    "gen_ai.provider.name": selected,
    "gen_ai.request.model": selected === "google" ? GOOGLE_EMBEDDING_MODEL : embeddingModelName(),
    "gen_ai.operation.name": "embeddings", "gen_ai.operation.type": "ai_client",
  }, () => selected === "google" ? embedWithGoogle(text) : embedWithOllama(text));
}
