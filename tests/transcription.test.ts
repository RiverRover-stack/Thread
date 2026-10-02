import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "../app/api/transcribe/route";

const originalFetch = globalThis.fetch;
const originalKey = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-only-key";
  globalThis.fetch = async () => { throw new Error("Unexpected provider call"); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
});

function upload(audio: Blob | string = new Blob(["fake-audio"], { type: "audio/webm" })) {
  const form = new FormData();
  if (typeof audio === "string") form.append("audio", audio);
  else form.append("audio", audio, "thought.webm");
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}

test("sends the audio to ElevenLabs and preserves the exact transcript", async () => {
  const transcript = "  Well... I should try this.\nMaybe tomorrow?  ";
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(new Headers(options?.headers).get("xi-api-key"), "test-only-key");
    const form = options?.body as FormData;
    assert.equal(form.get("model_id"), "scribe_v2");
    assert.equal(await (form.get("file") as File).text(), "fake-audio");
    return Response.json({ text: transcript });
  };
  const response = await POST(upload());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { transcript });
});

test("rejects non-multipart requests", async () => {
  const response = await POST(new Request("http://localhost/api/transcribe", { method: "POST", body: "{}" }));
  assert.equal(response.status, 400);
});

test("rejects missing, string, and empty audio fields", async () => {
  const missing = new Request("http://localhost/api/transcribe", { method: "POST", body: new FormData() });
  for (const request of [missing, upload("not-a-file"), upload(new Blob([]))]) {
    assert.equal((await POST(request)).status, 400);
  }
});

test("rejects malformed multipart data", async () => {
  const request = new Request("http://localhost/api/transcribe", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=missing" }, body: "broken",
  });
  assert.equal((await POST(request)).status, 400);
});

test("rejects an unsupported file type", async () => {
  assert.equal((await POST(upload(new Blob(["text"], { type: "text/plain" })))).status, 415);
});

test("rejects oversized audio even without Content-Length", async () => {
  const request = upload(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "audio/webm" }));
  assert.equal(request.headers.get("content-length"), null);
  assert.equal((await POST(request)).status, 413);
});

test("bounds the multipart body stream, not just its audio field", async () => {
  const form = new FormData();
  form.append("padding", new Blob([new Uint8Array(11 * 1024 * 1024)]));
  const request = new Request("http://localhost/api/transcribe", { method: "POST", body: form });
  assert.equal((await POST(request)).status, 413);
});

test("missing API key returns a configuration error without calling the provider", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const response = await POST(upload());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /ELEVENLABS_API_KEY/);
});

test("maps provider errors without exposing their bodies", async () => {
  for (const [providerStatus, expectedStatus] of [[401, 503], [403, 503], [429, 429], [422, 422], [500, 502]]) {
    globalThis.fetch = async () => new Response("sensitive provider detail", { status: providerStatus });
    const response = await POST(upload());
    assert.equal(response.status, expectedStatus);
    assert.doesNotMatch(await response.text(), /sensitive provider detail/);
  }
});

test("rejects missing, non-string, and empty transcript output", async () => {
  for (const [body, expectedStatus] of [[{}, 502], [{ text: 42 }, 502], [{ text: " \n " }, 422]] as const) {
    globalThis.fetch = async () => Response.json(body);
    assert.equal((await POST(upload())).status, expectedStatus);
  }
});

test("handles invalid JSON, provider network failure, and timeout", async () => {
  globalThis.fetch = async () => new Response("not-json");
  assert.equal((await POST(upload())).status, 502);
  globalThis.fetch = async () => { throw new TypeError("network down"); };
  assert.equal((await POST(upload())).status, 502);
  globalThis.fetch = async () => { throw new DOMException("timed out", "TimeoutError"); };
  assert.equal((await POST(upload())).status, 504);
});

// CHALLENGE: Prove that the upload limit accepts a file exactly at the boundary.
// TODO(you): Send exactly 10 MiB with a mocked successful provider; expect 200.
// Then compare it with the existing one-byte-over test. Don't call the real API.
