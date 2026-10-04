import "server-only";
import * as Sentry from "@sentry/nextjs";
import { safeAttributes, type Stage } from "./privacy";

type Metadata = Record<string, string | number>;
function telemetry(action: () => void) {
  try { action(); } catch { /* Monitoring must never change application behavior. */ }
}

export async function traceOperation<T>(stage: Stage, metadata: Metadata, operation: () => Promise<T>): Promise<T> {
  if (!Sentry.isEnabled()) return operation();
  // Save the promise so even a telemetry failure cannot execute a provider call twice.
  let work: Promise<T> | undefined;
  try {
    return await Sentry.startSpan({
      name: `thread.${stage}`,
      op: stage === "connection-workflow" ? "gen_ai.invoke_agent"
        : ["retrieve", "index"].includes(stage) ? "gen_ai.execute_tool" : "gen_ai.request",
      attributes: safeAttributes({ ...metadata, "thread.stage": stage, "sentry.origin": "manual.ai.thread" }),
    }, (span) => {
      work = (async () => {
        try {
          const result = await operation();
          telemetry(() => span.setAttribute("thread.outcome", "success"));
          return result;
        } catch (error) {
          telemetry(() => {
            span.setAttribute("thread.outcome", "error");
            span.setStatus({ code: 2, message: "internal_error" });
            if (error && typeof error === "object" && "status" in error) {
              span.setAttributes(safeAttributes({ "thread.http_status": error.status }));
            }
            Sentry.captureMessage(`Thread ${stage} failed`, { level: "error", tags: { "thread.stage": stage } });
          });
          throw error;
        }
      })();
      return work;
    });
  } catch {
    return work ?? operation();
  }
}

export function recordUsage(input: unknown, output: unknown) {
  telemetry(() => Sentry.getActiveSpan()?.setAttributes(safeAttributes({
    "gen_ai.usage.input_tokens": input, "gen_ai.usage.output_tokens": output,
  })));
}

export function recordCandidateCount(count: number) {
  telemetry(() => Sentry.getActiveSpan()?.setAttributes(safeAttributes({ "thread.candidate_count": count })));
}
