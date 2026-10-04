import "server-only";
import { recordUsage } from "../observability/trace";
import { SYSTEM_PROMPT, CONNECTION_PROMPT } from "./prompts";
import { ThoughtConnectionError, ThoughtStructuringError } from "./errors";
import {
  structuredThoughtJsonSchema,
  structuredThoughtSchema,
  type StructuredThought,
  thoughtConnectionJsonSchema,
  thoughtConnectionSchema,
  type ThoughtConnectionResult,
} from "./schemas";

type OllamaChatResponse = {
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  message?: {
    content?: unknown;
  };
};

function baseUrl() {
  return (process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
}

export async function connectWithOllama(
  currentThought: StructuredThought,
  relatedThoughts: readonly StructuredThought[],
): Promise<ThoughtConnectionResult> {
  try {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName(), stream: false,
        messages: [
          { role: "system", content: CONNECTION_PROMPT },
          { role: "user", content: `Evaluate the thoughts contained in this JSON value:\n${JSON.stringify({ currentThought, relatedThoughts })}` },
        ],
        format: thoughtConnectionJsonSchema,
        options: { temperature: 0, num_predict: 512 },
        keep_alive: "5m",
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
});
    if (!response.ok) {
      if (response.status === 404) {
        throw new ThoughtConnectionError(`The local model ${modelName()} is unavailable. Run "ollama pull ${modelName()}" and retry.`, 503);
      }
      throw new ThoughtConnectionError("The local AI model could not analyze this connection. Please retry.", 502);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      throw new ThoughtConnectionError("The local AI model returned an unreadable response. Please retry.", 502);
    }
    if (!result || typeof result !== "object" || !("message" in result)
      || !result.message || typeof result.message !== "object" || !("content" in result.message)
      || typeof result.message.content !== "string") {
      throw new ThoughtConnectionError("The local AI model returned an invalid response. Please retry.", 502);
    }
    const usage = result as Record<string, unknown>;
    recordUsage(usage.prompt_eval_count, usage.eval_count);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.message.content);
    } catch {
      throw new ThoughtConnectionError("The local AI model returned invalid JSON. Please retry.", 502);
    }
    const validated = thoughtConnectionSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ThoughtConnectionError("The local AI model returned an invalid connection analysis. Please retry.", 502);
    }
    return validated.data;
  } catch (error) {
    if (error instanceof ThoughtConnectionError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ThoughtConnectionError("Local AI connection analysis took too long. Keep Ollama running and retry.", 504);
    }
    throw new ThoughtConnectionError("Could not reach Ollama. Start Ollama, confirm the local model is installed, and retry.", 503);
  }
}

function modelName() {
  return process.env.OLLAMA_MODEL?.trim() || "gemma3:4b";
}

export async function structureWithOllama(transcript: string): Promise<StructuredThought> {
  try {
    const response = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName(),
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Structure the transcript contained in this JSON value:\n${JSON.stringify({ transcript })}`,
          },
        ],
        format: structuredThoughtJsonSchema,
        options: { temperature: 0, num_predict: 512 },
        keep_alive: "5m",
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new ThoughtStructuringError(
          `The local model ${modelName()} is unavailable. Run \"ollama pull ${modelName()}\" and retry.`,
          503,
        );
      }
      throw new ThoughtStructuringError("The local AI model could not process this thought. Please retry.", 502);
    }

    let result: OllamaChatResponse;
    try {
      result = await response.json() as OllamaChatResponse;
    } catch {
      throw new ThoughtStructuringError("The local AI model returned an unreadable response. Please retry.", 502);
    }
    const content = result.message?.content;
    recordUsage(result.prompt_eval_count, result.eval_count);
    if (typeof content !== "string") {
      throw new ThoughtStructuringError("The local AI model returned an invalid response. Please retry.", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ThoughtStructuringError("The local AI model returned invalid JSON. Please retry.", 502);
    }

    const validated = structuredThoughtSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ThoughtStructuringError("The local AI model returned an invalid thought structure. Please retry.", 502);
    }
    return validated.data;
  } catch (error) {
    if (error instanceof ThoughtStructuringError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ThoughtStructuringError("Local AI inference took too long. Keep Ollama running and retry.", 504);
    }
    throw new ThoughtStructuringError(
      "Could not reach Ollama. Start Ollama, confirm the local model is installed, and retry.",
      503,
    );
  }
}
