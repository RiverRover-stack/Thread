import { indexThought } from "@/lib/embeddings/index-thought";
import { EmbeddingError } from "@/lib/embeddings/errors";
import { requestAccessFailure } from "@/lib/demo-access";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = requestAccessFailure(_request);
  if (access) return access;
  try {
    const { id } = await params;
    const result = await indexThought(id);
    return Response.json(result ?? { error: "Thought not found." }, {
      status: result ? 200 : 404, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof EmbeddingError ? error.message : "Could not index this saved thought. Check PostgreSQL and migrations, then retry." }, {
      status: error instanceof EmbeddingError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
