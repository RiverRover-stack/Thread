import assert from "node:assert/strict";
import { trimDemoAudio } from "../lib/speech/trim-audio";

// Run during builds on Windows and Render/Linux. No secrets, database, or providers.
async function main() {
  const pcmBytes = 70 * 16_000 * 2;
  const source = Buffer.alloc(44 + pcmBytes);
  source.write("RIFF"); source.writeUInt32LE(36 + pcmBytes, 4); source.write("WAVEfmt ", 8);
  source.writeUInt32LE(16, 16); source.writeUInt16LE(1, 20); source.writeUInt16LE(1, 22);
  source.writeUInt32LE(16_000, 24); source.writeUInt32LE(32_000, 28);
  source.writeUInt16LE(2, 32); source.writeUInt16LE(16, 34);
  source.write("data", 36); source.writeUInt32LE(pcmBytes, 40);
  const result = await trimDemoAudio(new File([source], "synthetic.wav", { type: "audio/wav" }));
  const wav = Buffer.from(await result.arrayBuffer());
  assert.equal(wav.length, 44 + 60 * 16_000 * 2);
  assert.equal(wav.readUInt32LE(24), 16_000);
  assert.equal(wav.readUInt16LE(22), 1);
  console.log(`PASS FFmpeg (${process.platform}): 70 seconds trimmed to 60-second mono 16 kHz WAV. No provider calls.`);
}
main().catch(() => { console.error("FFmpeg build verification failed. Deployment must not proceed without a working decoder."); process.exitCode = 1; });
