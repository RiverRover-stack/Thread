import { getRelatedThoughts } from "@/lib/db/thoughts";
import { EmbeddingError } from "@/lib/embeddings/errors";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const relatedThoughts = await getRelatedThoughts(id);
    return Response.json(relatedThoughts === null ? { error: "Thought not found." } : { relatedThoughts }, {
      status: relatedThoughts === null ? 404 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof EmbeddingError ? error.message : "Could not retrieve related thoughts. Check PostgreSQL and migrations, then retry." }, {
      status: error instanceof EmbeddingError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
