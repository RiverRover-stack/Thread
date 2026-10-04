import { z } from "zod";
import { structuredThoughtSchema } from "@/lib/ai/schemas";
import { getDatabase } from "@/lib/db/client";
import { thoughtContentSelect } from "@/lib/db/thoughts";
import { requestAccessFailure } from "@/lib/demo-access";
import { publicDemo, requestWorkspace } from "@/lib/workspace";
import { lockUsage, reserveInTransaction, reportStorageFailure, UsageError, usageFailure } from "@/lib/usage";

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
  const access = requestAccessFailure(request);
  if (access) return access;
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
    const workspaceId = requestWorkspace(request.headers);
    // Repeating a save with the same ID must not insert twice or overwrite source truth.
    const query = {
      where: { id },
      create: { id, workspaceId, rawTranscript, ...structuredThought },
      update: {},
      select: { ...thoughtContentSelect, workspaceId: true },
    };
    const thought = publicDemo() ? await getDatabase().$transaction(async tx => {
      await lockUsage(tx);
      const existing = await tx.thought.findUnique({ where: { id }, select: query.select });
      if (existing) return existing;
      if (await tx.thought.count({ where: { workspaceId } }) >= 50) throw new UsageError("Your demo workspace has reached its 50-thought limit.", 429);
      await reserveInTransaction(tx, "save", workspaceId!);
      return tx.thought.upsert(query);
    }, { maxWait: 5000, timeout: 10000 }) : await getDatabase().thought.upsert(query);
    if (thought.workspaceId !== workspaceId) return failure("Thought not found.", 404);
    if (thought.rawTranscript !== rawTranscript
      || Object.entries(structuredThought).some(([key, value]) =>
        JSON.stringify(thought[key as keyof typeof thought]) !== JSON.stringify(value))) {
      return failure("This thought ID is already saved with different content.", 409);
    }
    const { workspaceId: _owner, ...content } = thought;
    void _owner;
    return Response.json({ thought: content }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const allowance = usageFailure(error); if (allowance) return allowance;
    if (publicDemo()) reportStorageFailure();
    return failure("Could not save the thought. Check PostgreSQL, DATABASE_URL, and database migrations, then retry saving.", 503);
  }
}
