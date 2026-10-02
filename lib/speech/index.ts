import "server-only";
import { transcribeWithElevenLabs } from "./elevenlabs";

// The application depends on this signature, not the provider's HTTP API.
export async function transcribeAudio(audio: File): Promise<string> {
  return transcribeWithElevenLabs(audio);
}
