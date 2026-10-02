import "server-only";
import { TranscriptionError } from "./errors";

export async function transcribeWithElevenLabs(audio: File): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new TranscriptionError("Transcription is not configured. Set ELEVENLABS_API_KEY in .env.local and restart the app.", 503);
  }

  const form = new FormData();
  form.append("file", audio);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    if (!response.ok) {
      // Never return provider error bodies: they can contain sensitive details.
      if (response.status === 401 || response.status === 403) {
        throw new TranscriptionError("ElevenLabs rejected the API key. Check its speech-to-text permissions and account access.", 503);
      }
      if (response.status === 429) {
        throw new TranscriptionError("Transcription is busy or your quota was reached. Wait a moment and retry, or check your ElevenLabs account.", 429);
      }
      if (response.status === 400 || response.status === 422) {
        throw new TranscriptionError("The transcription service could not read this audio. Try recording again.", 422);
      }
      throw new TranscriptionError("The transcription service is unavailable. Please retry shortly.", 502);
    }

    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("text" in result) || typeof result.text !== "string") {
      throw new TranscriptionError("The transcription service returned an invalid response. Please retry.", 502);
    }
    if (!result.text.trim()) {
      throw new TranscriptionError("No speech was detected. Try speaking clearly and recording again.", 422);
    }
    // Preserve the provider's transcript exactly; trim is only an emptiness check.
    return result.text;
  } catch (error) {
    if (error instanceof TranscriptionError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new TranscriptionError("Transcription took too long. Your audio is still available; please retry.", 504);
    }
    throw new TranscriptionError("Could not reach the transcription service or read its response. Please retry.", 502);
  }
}
