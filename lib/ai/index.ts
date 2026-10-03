import "server-only";
import { connectWithOllama, structureWithOllama } from "./ollama";
import type { StructuredThought, ThoughtConnectionResult } from "./schemas";

// The application depends on this contract, not Ollama's HTTP response shape.
export async function structureThought(transcript: string): Promise<StructuredThought> {
  return structureWithOllama(transcript);
}

// Explicit projection keeps database metadata and raw transcripts out of the prompt.
function connectionContext(thought: StructuredThought): StructuredThought {
  return {
    title: thought.title,
    summary: thought.summary,
    categories: thought.categories,
    actionable: thought.actionable,
    possibleAction: thought.possibleAction,
    questionToExplore: thought.questionToExplore,
  };
}

export async function findThoughtConnection(
  currentThought: StructuredThought,
  relatedThoughts: readonly StructuredThought[],
): Promise<ThoughtConnectionResult> {
  if (relatedThoughts.length === 0) {
    return { hasConnection: false, connection: null, implication: null, questionToExplore: null };
  }
  // Retrieval supplies candidates in relevance order. Bound the reasoning context too.
  return connectWithOllama(connectionContext(currentThought), relatedThoughts.slice(0, 5).map(connectionContext));
}
