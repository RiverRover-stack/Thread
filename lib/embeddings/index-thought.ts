import "server-only";
import { getEmbeddingSource, storeEmbedding } from "../db/embeddings";
import { embedTranscript, EMBEDDING_RECIPE_VERSION } from "./transcript";
import { embeddingModelName } from "./config";
import { traceOperation } from "../observability/trace";

export async function indexThought(id: string, workspace: string | null = null) {
  return traceOperation("index", {
    "gen_ai.operation.name": "execute_tool", "gen_ai.operation.type": "tool", "gen_ai.tool.name": "index",
  }, () => prepareEmbedding(id, workspace));
}

async function prepareEmbedding(id: string, workspace: string | null) {
  const model = embeddingModelName();
  const source = await getEmbeddingSource(id, workspace);
  if (!source) return null;
  if (source.indexed && source.embeddingModel === model && source.embeddingVersion === EMBEDDING_RECIPE_VERSION) {
    return { id, indexed: true, reused: true };
  }
  const vector = await embedTranscript(source.rawTranscript, workspace);
  const updated = await storeEmbedding(id, vector, model, EMBEDDING_RECIPE_VERSION, workspace);
  if (!updated) {
    // A concurrent index request may have completed first, or the thought was deleted.
    const latest = await getEmbeddingSource(id, workspace);
    if (!latest) return null;
    if (!latest.indexed || latest.embeddingModel !== model || latest.embeddingVersion !== EMBEDDING_RECIPE_VERSION) {
      throw new Error("EMBEDDING_WRITE_NOT_CONFIRMED");
    }
  }
  return { id, indexed: true, reused: !updated };
}
