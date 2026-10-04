import "server-only";
import { z } from "zod";
import { ThoughtConnectionError, ThoughtStructuringError } from "./errors";
import { CONNECTION_PROMPT, SYSTEM_PROMPT } from "./prompts";
import {
  structuredThoughtJsonSchema, structuredThoughtSchema,
  thoughtConnectionJsonSchema, thoughtConnectionSchema,
  type StructuredThought, type ThoughtConnectionResult,
} from "./schemas";

const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.string(),
    content: z.object({
      parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
    }),
  })).min(1),
});

type ProviderError = typeof ThoughtStructuringError | typeof ThoughtConnectionError;

async function generateJson(
  instructions: string,
  userData: string,
  jsonSchema: unknown,
  ErrorType: ProviderError,
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ErrorType("Set GEMINI_API_KEY on the server to use hosted Gemma.", 503);
  const model = process.env.GOOGLE_GEMMA_MODEL?.trim() || "gemma-4-26b-a4b-it";
  // Limit configuration to the documented hosted Gemma models, never Gemini.
  if (!/^gemma-4-(26b-a4b|31b)-it$/.test(model)) {
    throw new ErrorType("Set GOOGLE_GEMMA_MODEL to gemma-4-26b-a4b-it or gemma-4-31b-it.", 503);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        // Gemma's guide does not promise JSON-schema constrained generation.
        // Guide it with the schema in the prompt, then validate locally with Zod.
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${instructions}\n\nReturn only a JSON object, with no Markdown or commentary, matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` }] },
          contents: [{ role: "user", parts: [{ text: userData }] }],
          generationConfig: {
            temperature: 0, maxOutputTokens: 2048,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
        signal: AbortSignal.timeout(180_000),
        cache: "no-store",
        redirect: "error",
      },
    );
    if (!response.ok) {
      if (response.status === 429) throw new ErrorType("Hosted Gemma reached its quota. Wait and retry, or check your AI Studio limits.", 429);
      if ([400, 401, 403, 404].includes(response.status)) {
        throw new ErrorType("Hosted Gemma configuration was rejected. Check the server API key, model access, and AI Studio project.", 503);
      }
      throw new ErrorType("Hosted Gemma could not complete this request. Please retry.", 502);
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.promptFeedback?.blockReason) {
      throw new ErrorType("Hosted Gemma returned no usable response. Please retry.", 502);
    }
    const candidate = parsed.data.candidates[0];
    if (candidate.finishReason !== "STOP") {
      throw new ErrorType("Hosted Gemma did not finish a usable response. Please retry.", 502);
    }
    // Never return internal thinking parts as the application's interpretation.
    const text = candidate.content.parts.filter((part) => !part.thought).map((part) => part.text || "").join("").trim();
    // Accept one complete fenced JSON block, but never salvage fragments or prose.
    const json = text.replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
    return JSON.parse(json);
  } catch (error) {
    if (error instanceof ThoughtStructuringError || error instanceof ThoughtConnectionError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new ErrorType("Hosted Gemma took too long. Please retry.", 504);
    }
    if (error instanceof SyntaxError) throw new ErrorType("Hosted Gemma returned unreadable JSON. Please retry.", 502);
    // Do not include provider bodies, keys, or user content in errors or logs.
    throw new ErrorType("Could not reach hosted Gemma. Please retry.", 503);
  }
}

export async function structureWithGoogle(transcript: string): Promise<StructuredThought> {
  const output = await generateJson(
    SYSTEM_PROMPT,
    `Structure the transcript contained in this JSON value:\n${JSON.stringify({ transcript })}`,
    structuredThoughtJsonSchema,
    ThoughtStructuringError,
  );
  const validated = structuredThoughtSchema.safeParse(output);
  if (!validated.success) throw new ThoughtStructuringError("Hosted Gemma returned an invalid thought structure. Please retry.", 502);
  return validated.data;
}

export async function connectWithGoogle(
  currentThought: StructuredThought,
  relatedThoughts: readonly StructuredThought[],
): Promise<ThoughtConnectionResult> {
  const output = await generateJson(
    CONNECTION_PROMPT,
    `Evaluate the thoughts contained in this JSON value:\n${JSON.stringify({ currentThought, relatedThoughts })}`,
    thoughtConnectionJsonSchema,
    ThoughtConnectionError,
  );
  const validated = thoughtConnectionSchema.safeParse(output);
  if (!validated.success) throw new ThoughtConnectionError("Hosted Gemma returned an invalid connection analysis. Please retry.", 502);
  return validated.data;
}
