import { transcribeAudio } from "@/lib/speech";
import { TranscriptionError } from "@/lib/speech/errors";
import { requestAccessFailure } from "@/lib/demo-access";

export const runtime = "nodejs";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;

function failure(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = requestAccessFailure(request);
  if (access) return access;
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return failure("Send the recording as multipart form data with an audio file.", 400);
  }

  // Bound the actual stream too: Content-Length can be absent or incorrect.
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return failure("Recording is too large. Please record a shorter thought (maximum 10 MB).", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return failure("No audio was uploaded.", 400);

  let form: FormData;
  try {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return failure("Recording is too large. Please record a shorter thought (maximum 10 MB).", 413);
      }
      chunks.push(new Uint8Array(value));
    }
    form = await new Response(new Blob(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    return failure("The audio upload could not be read. Please retry.", 400);
  } finally {
    reader.releaseLock();
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return failure("Upload a non-empty audio recording.", 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return failure("Recording is too large. Please record a shorter thought (maximum 10 MB).", 413);
  }
  // Browsers may emit audio/webm, audio/mp4, audio/ogg, or an unspecified type.
  // This is a metadata check; the provider still needs to decode the actual audio.
  if (audio.type && audio.type !== "application/octet-stream" && !audio.type.startsWith("audio/") && audio.type !== "video/webm") {
    return failure("Please upload an audio recording.", 415);
  }

  try {
    const transcript = await transcribeAudio(audio);
    return Response.json({ transcript }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TranscriptionError) return failure(error.message, error.status);
    return failure("Transcription failed unexpectedly. Please retry.", 500);
  }
}
