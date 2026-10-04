"use client";

import { useEffect, useState } from "react";
import { thoughtConnectionSchema, type ThoughtConnectionResult } from "@/lib/ai/schemas";

type State = { kind: "loading" }
  | { kind: "ready"; result: ThoughtConnectionResult }
  | { kind: "error"; message: string };

export function ConnectionContent({ result }: { result: ThoughtConnectionResult }) {
  if (!result.hasConnection) return null;

  return (
    <section aria-labelledby="connection-heading" className="mt-6 min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-8">
      <p className="text-xs font-semibold tracking-widest text-emerald-900">AI INTERPRETED</p>
      <h2 id="connection-heading" className="mt-2 text-xl font-semibold">You were onto something</h2>
      <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-stone-700">{result.connection}</p>
      <h3 className="mt-6 font-semibold">Why this matters</h3>
      <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-stone-700">{result.implication}</p>
      {result.questionToExplore && <div className="mt-6">
        <h3 className="font-semibold">A question to keep thinking about</h3>
        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-stone-700">{result.questionToExplore}</p>
      </div>}
    </section>
  );
}

export default function ThoughtConnection({ thoughtId }: { thoughtId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/thoughts/${thoughtId}/connection`, {
          method: "POST", cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(200_000)]),
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error : "Could not analyze this thought's connections. Please retry.";
          throw new Error(message);
        }
        const validated = thoughtConnectionSchema.safeParse(result);
        if (!validated.success) throw new Error("The server returned an invalid connection analysis. Please retry.");
        if (!controller.signal.aborted) setState({ kind: "ready", result: validated.data });
      } catch (error) {
        if (controller.signal.aborted) return;
        const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        setState({ kind: "error", message: timeout
          ? "Connection analysis took too long. Your saved thought is still available. Please retry."
          : error instanceof TypeError || error instanceof SyntaxError
            ? "Could not load connection analysis. Check that Thread is running, then retry."
            : error instanceof Error ? error.message : "Could not analyze connections. Please retry." });
      }
    }
    void load();
    return () => controller.abort();
  }, [thoughtId, attempt]);

  if (state.kind === "ready") return state.result.hasConnection
    ? <ConnectionContent result={state.result} />
    : <p role="status" className="mt-6 rounded-xl border border-stone-200 p-4 text-sm leading-relaxed text-stone-600">No useful connection emerged this time. Your related thoughts are still worth revisiting.</p>;
  if (state.kind === "loading") return (
    <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <p role="status" className="text-sm font-semibold text-emerald-900">Checking for a useful connection…</p>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">Gemma is comparing a few related thoughts. You can keep reading or return to your timeline.</p>
    </div>
  );
  return (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed">
      <p role="alert" className="text-stone-700"><strong>Could not analyze connections. </strong>{state.message}</p>
      <button type="button" onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}
        className="mt-3 min-h-11 rounded px-2 py-2 font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-2">Retry connection analysis</button>
    </div>
  );
}
