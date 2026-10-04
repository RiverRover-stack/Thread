import { loadEnvConfig } from "@next/env";
import { performance } from "node:perf_hooks";
import { embedText } from "../lib/embeddings";
import { EmbeddingError } from "../lib/embeddings/errors";
import { chunkTranscript, embedTranscript, EMBEDDING_RECIPE_VERSION } from "../lib/embeddings/transcript";

loadEnvConfig(process.cwd());

const cases = [
  "I should benchmark my compressed model on a Raspberry Pi.",
  "Measure inference latency and memory use on the small deployment device.",
  "I enjoyed the rain while walking to the library.",
  "I am an AI software engineer."
];

async function main() {
  const vectors: number[][] = [];
  for (const [index, text] of cases.entries()) {
    const startedAt = performance.now();
    const vector = await embedText(text);
    vectors.push(vector);
    console.log(`Case ${index + 1}: ${vector.length} dimensions, magnitude ${Math.hypot(...vector).toFixed(4)}, ${Math.round(performance.now() - startedAt)} ms.`);
  }
  const cosine = (left: number[], right: number[]) =>
    left.reduce((sum, value, index) => sum + value * right[index], 0) / (Math.hypot(...left) * Math.hypot(...right));
  const related = cosine(vectors[0], vectors[1]);
  const unrelated = cosine(vectors[0], vectors[2]);
  console.log(`Synthetic similarity: related ${related.toFixed(4)}, unrelated ${unrelated.toFixed(4)}. Review the configured retrieval threshold against these scores.`);
  if (related <= unrelated) throw new EmbeddingError("Synthetic ranking failed: the related example did not rank above the unrelated example.", 502);
  const longTranscript = "I want to measure inference latency and memory use on my Raspberry Pi before choosing a compressed model. ".repeat(25);
  const startedAt = performance.now();
  const transcriptVector = await embedTranscript(longTranscript);
  console.log(`Long transcript: ${chunkTranscript(longTranscript).length} chunks, ${transcriptVector.length} dimensions, magnitude ${Math.hypot(...transcriptVector).toFixed(4)}, recipe ${EMBEDDING_RECIPE_VERSION}, ${Math.round(performance.now() - startedAt)} ms.`);
  console.log("Selected embedding provider and one synthetic ranking verified. No database writes, text, or vectors logged. This does not establish full retrieval quality.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof EmbeddingError ? error.message : "Embedding evaluation failed. Check the selected embedding provider configuration.");
  process.exitCode = 1;
});
