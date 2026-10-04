import type { ErrorEvent, init } from "@sentry/nextjs";

// Derive the SDK's streamed-span type from its public configuration hook.
type StreamedSpanJSON = Parameters<NonNullable<Parameters<typeof init>[0]["beforeSendSpan"]>>[0];

export const stages = ["transcribe", "structure", "embed", "index", "retrieve", "connect", "connection-workflow", "allowance"] as const;
export type Stage = typeof stages[number];

const stringValues: Record<string, readonly string[]> = {
  "thread.stage": stages,
  "thread.outcome": ["success", "error", "skipped"],
  "gen_ai.provider.name": ["google", "ollama", "elevenlabs"],
  "gen_ai.operation.name": ["chat", "embeddings", "transcription", "invoke_agent", "execute_tool"],
  "gen_ai.operation.type": ["ai_client", "agent", "tool"],
  "gen_ai.agent.name": ["Thread thought connection"],
  "gen_ai.tool.name": ["retrieve", "index"],
  "sentry.op": ["gen_ai.request", "gen_ai.invoke_agent", "gen_ai.execute_tool"],
  "sentry.origin": ["manual.ai.thread"],
};
const counts = new Set(["gen_ai.usage.input_tokens", "gen_ai.usage.output_tokens", "thread.candidate_count", "thread.http_status"]);

// Allow known metadata; never try to redact an arbitrary prompt or error message.
export function safeAttributes(input: Record<string, unknown>): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const [key, wrapped] of Object.entries(input)) {
    const value = wrapped && typeof wrapped === "object" && "value" in wrapped ? wrapped.value : wrapped;
    if (typeof value === "string" && stringValues[key]?.includes(value)) output[key] = value;
    if (key === "gen_ai.request.model" && typeof value === "string"
      && /^(gemma-4-(26b-a4b|31b)-it|gemma3:[a-z0-9.-]+|embeddinggemma:[a-z0-9.-]+|gemini-embedding-2|scribe_v2)$/.test(value)
      && value.length <= 64) output[key] = value;
    if (counts.has(key) && typeof value === "number" && Number.isSafeInteger(value) && value >= 0) output[key] = value;
  }
  return output;
}

export function sanitizeSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  return {
    trace_id: span.trace_id, span_id: span.span_id, parent_span_id: span.parent_span_id,
    name: stages.some((stage) => span.name === `thread.${stage}`) ? span.name : "Thread request",
    start_timestamp: span.start_timestamp, end_timestamp: span.end_timestamp,
    status: span.status, is_segment: span.is_segment,
    attributes: safeAttributes(span.attributes),
    // No links: third-party span links may carry request data.
  };
}

export function sanitizeError(event: ErrorEvent): ErrorEvent | null {
  const stage = event.tags?.["thread.stage"];
  if (typeof stage !== "string" || !stages.includes(stage as Stage)) return null;
  const trace = event.contexts?.trace;
  return {
    type: undefined, event_id: event.event_id, timestamp: event.timestamp,
    level: "error", platform: "node", message: `Thread ${stage} failed`,
    tags: { "thread.stage": stage }, fingerprint: ["thread", stage],
    contexts: trace ? { trace: { trace_id: trace.trace_id, span_id: trace.span_id } } : undefined,
    // Deliberately omit request, user, breadcrumbs, exception, extra and stack locals.
  };
}

export function traceSampleRate(value: string | undefined): number {
  const rate = value?.trim() ? Number(value) : 0.1;
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1;
}
