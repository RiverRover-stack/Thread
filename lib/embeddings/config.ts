import "server-only";

export function embeddingModelName() {
  return process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "embeddinggemma:300m";
}
