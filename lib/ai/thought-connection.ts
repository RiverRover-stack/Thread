import "server-only";
import { getRelatedThoughts, getThought } from "../db/thoughts";
import { findThoughtConnection } from "./index";
import type { ThoughtConnectionResult } from "./schemas";
import { traceOperation } from "../observability/trace";

export async function getThoughtConnection(id: string, workspace: string | null = null): Promise<ThoughtConnectionResult | null> {
  return traceOperation("connection-workflow", {
    "gen_ai.operation.name": "invoke_agent", "gen_ai.operation.type": "agent", "gen_ai.agent.name": "Thread thought connection",
  }, () => analyzeConnection(id, workspace));
}

async function analyzeConnection(id: string, workspace: string | null): Promise<ThoughtConnectionResult | null> {
  const currentThought = await getThought(id, workspace);
  if (!currentThought) return null;

  // Reuse Phase 2's threshold, earlier-only filtering, and embedding compatibility checks.
  // Unprepared memory keeps its existing 409 error; the caller prepares it first.
  const candidates = await getRelatedThoughts(id, workspace);
  if (candidates === null) return null;

  // Retrieval cards omit actions and questions. Load full records only for these matches.
  // Promise.all preserves relevance order even if database reads finish out of order.
  const records = await Promise.all(candidates.slice(0, 5).map((candidate) => getThought(candidate.id, workspace)));
  const relatedThoughts = records.filter((thought) => thought !== null);
  // A candidate deleted between retrieval and loading is omitted; empty input skips Gemma.
  return findThoughtConnection(currentThought, relatedThoughts, workspace);
}
