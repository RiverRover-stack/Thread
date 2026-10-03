import { z } from "zod";
import { structuredThoughtSchema } from "@/lib/ai/schemas";
import { getDatabase } from "@/lib/db/client";

export const runtime = "nodejs";
const saveThoughtSchema = z.object({
  id: z.uuid(),
  rawTranscript: z.string().min(1).max(10_000).refine((text) => text.trim().length > 0),
  structuredThought: structuredThoughtSchema,
}).strict();
const MAX_BODY_BYTES = 64 * 1024;

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return failure("Send the thought as JSON.", 415);
  }

  let body: unknown;
  const reader = request.body?.getReader();
  if (!reader) return failure("Provide a thought to save.", 400);
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return failure("The thought is too large to save.", 413);
      }
      chunks.push(new Uint8Array(value));
    }
    body = JSON.parse(await new Blob(chunks).text());
  } catch {
    return failure("Provide valid JSON.", 400);
  } finally {
    reader.releaseLock();
  }

  const input = saveThoughtSchema.safeParse(body);
  if (!input.success) return failure("Provide a valid ID, raw transcript, and structured thought.", 400);
  if (!process.env.DATABASE_URL) {
    return failure("Database is not configured. Set DATABASE_URL in .env.local and restart Thread.", 503);
  }

  try {
    const { id, rawTranscript, structuredThought } = input.data;
    // Repeating a save with the same ID must not insert twice or overwrite source truth.
    const thought = await getDatabase().thought.upsert({
      where: { id },
      create: { id, rawTranscript, ...structuredThought },
      update: {},
    });
    if (thought.rawTranscript !== rawTranscript
      || Object.entries(structuredThought).some(([key, value]) =>
        JSON.stringify(thought[key as keyof typeof thought]) !== JSON.stringify(value))) {
      return failure("This thought ID is already saved with different content.", 409);
    }
    return Response.json({ thought }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("Could not save the thought. Check PostgreSQL, DATABASE_URL, and database migrations, then retry saving.", 503);
  }
}
