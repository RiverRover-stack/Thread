import "server-only";
import { transcribeWithElevenLabs } from "./elevenlabs";
import { traceOperation } from "../observability/trace";

// The application depends on this signature, not the provider's HTTP API.
export async function transcribeAudio(audio: File): Promise<string> {
  return traceOperation("transcribe", {
    "gen_ai.provider.name": "elevenlabs", "gen_ai.request.model": "scribe_v2",
    "gen_ai.operation.name": "transcription", "gen_ai.operation.type": "ai_client",
  }, () => transcribeWithElevenLabs(audio));
}
