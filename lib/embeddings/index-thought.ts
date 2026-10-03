import "server-only";
import { getEmbeddingSource, storeEmbedding } from "../db/embeddings";
import { embedTranscript, EMBEDDING_RECIPE_VERSION } from "./transcript";
import { embeddingModelName } from "./config";

export async function indexThought(id: string) {
  const model = embeddingModelName();
  const source = await getEmbeddingSource(id);
  if (!source) return null;
  if (source.indexed && source.embeddingModel === model && source.embeddingVersion === EMBEDDING_RECIPE_VERSION) {
    return { id, indexed: true, reused: true };
  }
  const vector = await embedTranscript(source.rawTranscript);
  const updated = await storeEmbedding(id, vector, model, EMBEDDING_RECIPE_VERSION);
  if (!updated) {
    // A concurrent index request may have completed first, or the thought was deleted.
    const latest = await getEmbeddingSource(id);
    if (!latest) return null;
    if (!latest.indexed || latest.embeddingModel !== model || latest.embeddingVersion !== EMBEDDING_RECIPE_VERSION) {
      throw new Error("EMBEDDING_WRITE_NOT_CONFIRMED");
    }
  }
  return { id, indexed: true, reused: !updated };
}
