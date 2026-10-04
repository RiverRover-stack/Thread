"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { indexingResponseSchema, relatedThoughtsResponseSchema, type RelatedThoughtCard } from "@/lib/embeddings/response-schemas";
import ThoughtConnection from "./ThoughtConnection";

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
    <>
    <section aria-labelledby="related-heading" className="mt-8 min-w-0 rounded-2xl border border-stone-300 bg-white p-5 sm:p-8">
      <h2 id="related-heading" className="text-xl font-semibold">Related thoughts</h2>
      <p className="mt-2 text-sm text-stone-600">Earlier thoughts with similar meaning.</p>
      {(state.kind === "indexing" || state.kind === "retrieving") && <div className="mt-5 rounded-xl bg-stone-50 p-4">
        <p role="status" className="text-sm text-stone-600">
        {state.kind === "indexing" ? "Preparing semantic memory…" : "Finding related thoughts…"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-stone-500">Your thought is already saved. You can keep reading while this loads.</p>
        <div aria-hidden="true" className="mt-4 space-y-2 motion-safe:animate-pulse">
          <div className="h-4 w-2/3 rounded bg-stone-200" />
          <div className="h-3 w-full rounded bg-stone-200" />
        </div>
      </div>}
      {(state.kind === "indexing-error" || state.kind === "retrieval-error") && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed">
        <p role="alert" className="text-stone-700"><strong>{state.kind === "indexing-error" ? "Could not prepare semantic memory. " : "Could not find related thoughts. "}</strong>{state.message}</p>
        <button type="button" onClick={() => { setState({ kind: "indexing" }); setAttempt((value) => value + 1); }} className="mt-3 min-h-11 rounded px-2 py-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">Retry related thoughts</button>
      </div>}
      {state.kind === "ready" && (state.thoughts.length === 0
        ? <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-4">
            <p className="text-sm font-semibold text-stone-700">No related earlier thoughts found yet.</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">Keep capturing ideas. Earlier thoughts will appear here when they share useful context.</p>
          </div>
        : <ul className="mt-5 space-y-4">
          {state.thoughts.map((thought) => <li key={thought.id}>
            <Link href={`/thoughts/${thought.id}`} aria-labelledby={`related-title-${thought.id}`} className="block min-w-0 rounded-xl border border-stone-200 p-4 transition-colors hover:border-emerald-700 hover:bg-emerald-50/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">
            <h3 id={`related-title-${thought.id}`} className="break-words font-semibold leading-snug text-emerald-900">{thought.title}</h3>
            <time dateTime={thought.createdAt} className="mt-2 block text-xs text-stone-500">{new Date(thought.createdAt).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
            })} UTC</time>
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700">{thought.summary}</p>
            <p aria-hidden="true" className="mt-3 text-sm font-semibold text-emerald-900">Revisit thought →</p>
            </Link>
          </li>)}
        </ul>)}
    </section>
    {state.kind === "ready" && state.thoughts.length > 0 && <ThoughtConnection key={thoughtId} thoughtId={thoughtId} />}
    </>
  );
}
