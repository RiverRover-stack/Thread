import "server-only";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { TranscriptionError } from "./errors";

// Resolve from the deployed node_modules directory, not a bundled relative path.
function executable() {
  try { return createRequire(path.join(process.cwd(), "package.json"))("ffmpeg-static") as string | null; }
  catch { return null; }
}
export async function trimDemoAudio(audio: File, timeoutMs = 15_000): Promise<File> {
  const binary = executable();
  if (!binary) throw new TranscriptionError("Demo audio processing is unavailable.", 503);
  const input = Buffer.from(await audio.arrayBuffer());
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ binary, ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
      "-protocol_whitelist", "pipe", "-i", "pipe:0", "-map", "0:a:0", "-vn", "-t", "60",
      "-threads", "1", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let size = 0, failed = false;
    function fail(message: string, status: number) {
      if (failed) return;
      failed = true; child.kill(); clearTimeout(timer);
      reject(new TranscriptionError(message, status));
    }
    const timer = setTimeout(() => fail("Audio could not be decoded in time. Try a shorter recording.", 422), timeoutMs);
    child.on("error", () => fail("Demo audio processing is unavailable.", 503));
    child.stdin.on("error", () => { /* Decoder exit is handled below; do not expose stderr. */ });
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 60 * 16000 * 2) fail("Audio exceeded the demo processing limit.", 422);
      else chunks.push(chunk);
    });
    child.on("close", code => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0 || size < 2 || size % 2 !== 0) return fail("This audio could not be decoded. Try recording again.", 422);
      const header = Buffer.alloc(44);
      header.write("RIFF", 0); header.writeUInt32LE(36 + size, 4); header.write("WAVEfmt ", 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
      header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
      header.write("data", 36); header.writeUInt32LE(size, 40);
      resolve(new File([new Uint8Array(Buffer.concat([header, ...chunks]))], "demo.wav", { type: "audio/wav" }));
    });
    child.stdin.end(input);
  });
}
