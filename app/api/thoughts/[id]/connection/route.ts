import { getThoughtConnection } from "@/lib/ai/thought-connection";
import { ThoughtConnectionError } from "@/lib/ai/errors";
import { EmbeddingError } from "@/lib/embeddings/errors";
import { requestAccessFailure } from "@/lib/demo-access";
import { requestWorkspace } from "@/lib/workspace";
import { usageFailure } from "@/lib/usage";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = requestAccessFailure(_request);
  if (access) return access;
  try {
    const { id } = await params;
    const result = await getThoughtConnection(id, requestWorkspace(_request.headers));
    return Response.json(result ?? { error: "Thought not found." }, {
      status: result === null ? 404 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const allowance = usageFailure(error); if (allowance) return allowance;
    const knownError = error instanceof ThoughtConnectionError || error instanceof EmbeddingError;
    return Response.json({ error: knownError ? error.message : "Could not analyze this thought's connections. Check PostgreSQL and migrations, then retry." }, {
      status: knownError ? error.status : 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
