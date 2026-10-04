import "server-only";
import { connectWithOllama, structureWithOllama } from "./ollama";
import { connectWithGoogle, structureWithGoogle } from "./google";
import { ThoughtConnectionError, ThoughtStructuringError } from "./errors";
import type { StructuredThought, ThoughtConnectionResult } from "./schemas";

function provider(): "ollama" | "google" | null {
  const configured = process.env.AI_PROVIDER?.trim() || "ollama";
  return configured === "ollama" || configured === "google" ? configured : null;
}

// The application depends on this contract, not a provider's HTTP response shape.
export async function structureThought(transcript: string): Promise<StructuredThought> {
  const selected = provider();
  if (!selected) throw new ThoughtStructuringError("Set AI_PROVIDER to ollama or google on the server.", 503);
  // CHALLENGE: predict which adapter runs with AI_PROVIDER unset, ollama, or google.
  // TODO(you): Add the three cases to DEPLOYMENT.md in your own words.
  // Hint 1: provider() supplies the default. Hint 2: === compares two values.
  // Verify: compare your prediction with the provider-switch tests in google-ai.test.ts.
  return selected === "google" ? structureWithGoogle(transcript) : structureWithOllama(transcript);
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
  const selected = provider();
  if (!selected) throw new ThoughtConnectionError("Set AI_PROVIDER to ollama or google on the server.", 503);
  const current = connectionContext(currentThought);
  const related = relatedThoughts.slice(0, 5).map(connectionContext);
  return selected === "google" ? connectWithGoogle(current, related) : connectWithOllama(current, related);
}
