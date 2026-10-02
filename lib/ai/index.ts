import "server-only";
import { structureWithOllama } from "./ollama";
import type { StructuredThought } from "./schemas";

// The application depends on this contract, not Ollama's HTTP response shape.
export async function structureThought(transcript: string): Promise<StructuredThought> {
  return structureWithOllama(transcript);
}
