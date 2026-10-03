import "server-only";
import { embedText } from "./index";
import { EmbeddingError } from "./errors";
import { EMBEDDING_DIMENSIONS, embeddingInputSchema, embeddingVectorSchema } from "./schemas";

export const EMBEDDING_RECIPE_VERSION = 1;
const MAX_CHUNK_BYTES = 1000;
const MAX_OVERLAP_BYTES = 100;

export function chunkTranscript(transcript: string): string[] {
  if (!embeddingInputSchema.safeParse(transcript).success || transcript.length > 10_000) {
    throw new EmbeddingError("Provide a nonempty transcript of at most 10,000 characters.", 400);
  }

  // Array.from reads Unicode code points, keeping surrogate pairs such as emoji together.
  const characters = Array.from(transcript);
  const byteSizes = characters.map((character) => Buffer.byteLength(character, "utf8"));
  const chunks: string[] = [];
  let start = 0;

  while (start < characters.length) {
    let end = start;
    let bytes = 0;
    while (end < characters.length && bytes + byteSizes[end] <= MAX_CHUNK_BYTES) {
      bytes += byteSizes[end];
      end += 1;
    }
    chunks.push(characters.slice(start, end).join(""));
    if (end === characters.length) break;

    // Carry a small suffix into the next chunk without exceeding the overlap budget.
    let overlapStart = end;
    let overlapBytes = 0;
    while (overlapStart > start && overlapBytes + byteSizes[overlapStart - 1] <= MAX_OVERLAP_BYTES) {
      overlapStart -= 1;
      overlapBytes += byteSizes[overlapStart];
    }
    start = overlapStart;
  }
  return chunks;
}

export async function embedTranscript(transcript: string): Promise<number[]> {
  // Whitespace-only chunks carry no meaning, but the original transcript stays intact.
  const chunks = chunkTranscript(transcript).filter((chunk) => chunk.trim().length > 0);
  const mean = Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const chunk of chunks) {
    const vector = await embedText(chunk);
    for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
      mean[index] += vector[index] / chunks.length;
    }
  }

  if (!embeddingVectorSchema.safeParse(mean).success) {
    throw new EmbeddingError("Could not produce a finite, nonzero transcript embedding. Please retry.", 502);
  }
  const magnitude = Math.hypot(...mean);
  const normalized = mean.map((value) => value / magnitude);
  if (!embeddingVectorSchema.safeParse(normalized).success) {
    throw new EmbeddingError("Could not normalize the transcript embedding. Please retry.", 502);
  }
  return normalized;
}
