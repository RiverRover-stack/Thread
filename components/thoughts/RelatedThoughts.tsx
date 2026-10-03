"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { indexingResponseSchema, relatedThoughtsResponseSchema, type RelatedThoughtCard } from "@/lib/embeddings/response-schemas";

type State = { kind: "indexing" | "retrieving" }
  | { kind: "ready"; thoughts: RelatedThoughtCard[] }
  | { kind: "indexing-error" | "retrieval-error"; message: string };

function responseError(result: unknown, fallback: string) {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback;
}

export default function RelatedThoughts({ thoughtId }: { thoughtId: string }) {
  const [state, setState] = useState<State>({ kind: "indexing" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      let phase: "indexing" | "retrieval" = "indexing";
      try {
        const indexedResponse = await fetch(`/api/thoughts/${thoughtId}/embedding`, {
          method: "POST", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]), cache: "no-store",
        });
        const indexedResult: unknown = await indexedResponse.json();
        if (!indexedResponse.ok) throw new Error(responseError(indexedResult, "Could not prepare semantic memory."));
        const indexed = indexingResponseSchema.safeParse(indexedResult);
        if (!indexed.success || indexed.data.id !== thoughtId) throw new Error("The server returned an invalid memory confirmation.");
        if (controller.signal.aborted) return;
        phase = "retrieval";
        setState({ kind: "retrieving" });
        const response = await fetch(`/api/thoughts/${thoughtId}/related`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]), cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(result, "Could not retrieve related thoughts."));
        const related = relatedThoughtsResponseSchema.safeParse(result);
        if (!related.success) throw new Error("The server returned invalid related thoughts.");
        if (!controller.signal.aborted) setState({ kind: "ready", thoughts: related.data.relatedThoughts });
      } catch (error) {
        if (controller.signal.aborted) return;
        const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        setState({ kind: phase === "indexing" ? "indexing-error" : "retrieval-error", message: timeout
          ? "Semantic memory took too long. Your saved thought is still available. Please retry."
          : error instanceof TypeError || error instanceof SyntaxError
            ? "Could not load semantic memory. Check that Thread is running, then retry."
            : error instanceof Error ? error.message : "Could not load semantic memory. Please retry." });
      }
    }
    void load();
    return () => controller.abort();
  }, [thoughtId, attempt]);

  return (
    <section aria-labelledby="related-heading" className="mt-8 rounded-xl border border-stone-300 bg-white p-5 sm:p-6">
      <h2 id="related-heading" className="text-xl font-semibold">Related thoughts</h2>
      <p className="mt-2 text-sm text-stone-600">Earlier thoughts with similar meaning.</p>
      {(state.kind === "indexing" || state.kind === "retrieving") && <p role="status" className="mt-4 text-stone-600">
        {state.kind === "indexing" ? "Preparing semantic memory…" : "Finding related thoughts…"}
      </p>}
      {(state.kind === "indexing-error" || state.kind === "retrieval-error") && <div className="mt-4">
        <p role="alert" className="text-stone-700"><strong>{state.kind === "indexing-error" ? "Could not prepare semantic memory. " : "Could not find related thoughts. "}</strong>{state.message}</p>
        <button type="button" onClick={() => { setState({ kind: "indexing" }); setAttempt((value) => value + 1); }} className="mt-3 font-semibold text-emerald-900 underline">Retry related thoughts</button>
      </div>}
      {state.kind === "ready" && (state.thoughts.length === 0
        ? <p className="mt-4 text-stone-600">No related earlier thoughts found yet.</p>
        : <ul className="mt-5 space-y-4">
          {state.thoughts.map((thought) => <li key={thought.id} className="rounded-lg border border-stone-200 p-4">
            <Link href={`/thoughts/${thought.id}`} className="break-words font-semibold text-emerald-900 underline">{thought.title}</Link>
            {/* CHALLENGE: Show seconds in the card timestamp using its existing options.
                TODO(you): Edit toLocaleString below. Hint 1: find minute. Hint 2: add
                second with the same value. Verify: open a related card and see HH:MM:SS. */}
            <time dateTime={thought.createdAt} className="mt-2 block text-xs text-stone-500">{new Date(thought.createdAt).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
            })} UTC</time>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700">{thought.summary}</p>
          </li>)}
        </ul>)}
    </section>
  );
}
