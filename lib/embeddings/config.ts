import "server-only";
import { EmbeddingError } from "./errors";

export const GOOGLE_EMBEDDING_MODEL = "gemini-embedding-2";

export function embeddingProvider(): "ollama" | "google" {
  const selected = process.env.EMBEDDING_PROVIDER?.trim() || "ollama";
  if (selected !== "ollama" && selected !== "google") {
    throw new EmbeddingError("Set EMBEDDING_PROVIDER to ollama or google on the server.", 503);
  }
  return selected;
}

export function embeddingModelName() {
  // Keep existing local metadata intact; namespace hosted vectors independently.
  if (embeddingProvider() === "google") return `google:${GOOGLE_EMBEDDING_MODEL}`;
  return process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "embeddinggemma:300m";
}
