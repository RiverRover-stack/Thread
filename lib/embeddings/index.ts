import "server-only";
import { embedWithOllama } from "./ollama";
import { embedWithGoogle } from "./google";
import { embeddingProvider } from "./config";

export async function embedText(text: string): Promise<number[]> {
  return embeddingProvider() === "google" ? embedWithGoogle(text) : embedWithOllama(text);
}
