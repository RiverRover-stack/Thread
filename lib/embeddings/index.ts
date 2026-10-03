import "server-only";
import { embedWithOllama } from "./ollama";

export async function embedText(text: string): Promise<number[]> {
  return embedWithOllama(text);
}
