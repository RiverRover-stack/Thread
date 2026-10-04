import { getRelatedThoughts } from "@/lib/db/thoughts";
import { EmbeddingError } from "@/lib/embeddings/errors";
import { requestAccessFailure } from "@/lib/demo-access";
import { requestWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = requestAccessFailure(_request);
  if (access) return access;
  try {
    const { id } = await params;
    const relatedThoughts = await getRelatedThoughts(id, requestWorkspace(_request.headers));
    return Response.json(relatedThoughts === null ? { error: "Thought not found." } : { relatedThoughts }, {
      status: relatedThoughts === null ? 404 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof EmbeddingError ? error.message : "Could not retrieve related thoughts. Check PostgreSQL and migrations, then retry." }, {
      status: error instanceof EmbeddingError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
