import "server-only";
import { transcribeWithElevenLabs } from "./elevenlabs";
import { traceOperation } from "../observability/trace";
import { publicDemo } from "../workspace";
import { assertPublicAI, reserveProviderCall } from "../usage";
import { trimDemoAudio } from "./trim-audio";

// The application depends on this signature, not the provider's HTTP API.
export async function transcribeAudio(audio: File, workspace: string | null = null): Promise<string> {
  assertPublicAI(workspace);
  const boundedAudio = publicDemo() ? await trimDemoAudio(audio) : audio;
  await reserveProviderCall("transcribe", workspace);
  return traceOperation("transcribe", {
    "gen_ai.provider.name": "elevenlabs", "gen_ai.request.model": "scribe_v2",
    "gen_ai.operation.name": "transcription", "gen_ai.operation.type": "ai_client",
  }, () => transcribeWithElevenLabs(boundedAudio));
}
