import { structureThought } from "@/lib/ai";
import { ThoughtStructuringError } from "@/lib/ai/errors";
import { z } from "zod";
import { requestAccessFailure } from "@/lib/demo-access";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 20 * 1024;
const processRequestSchema = z.object({
  transcript: z.string().min(1).max(10_000).refine((value) => value.trim().length > 0),
}).strict();

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = requestAccessFailure(request);
  if (access) return access;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return failure("Send the transcript as JSON.", 415);
  }

  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return failure("The transcript is too large to process.", 413);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return failure("The transcript is too large to process.", 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return failure("The request must contain valid JSON.", 400);
  }

  const input = processRequestSchema.safeParse(body);
  if (!input.success) {
    return failure("Provide a non-empty transcript of at most 10,000 characters.", 400);
  }

  try {
    // Pass the exact transcript onward. Validation must never rewrite the user's words.
    const structuredThought = await structureThought(input.data.transcript);
    return Response.json({ structuredThought }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ThoughtStructuringError) return failure(error.message, error.status);
    return failure("Thought processing failed unexpectedly. Please retry.", 500);
  }
}
