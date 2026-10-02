# Thread

Don't interrupt a thought to save it.

## Current scope

Phase 1, Milestone 3: the Next.js homepage captures microphone audio, provides
local playback, and sends the recording to ElevenLabs for transcription after
stopping. It then sends the raw transcript to a local Gemma model through Ollama
and validates the structured thought with Zod. Persistence, timeline, and detail
pages are not implemented yet.
See PROJECT_SPEC.md for product scope and AGENTS.md for our
collaboration rules.

## Local setup

Use Node.js 22.12+ on the 22.x line, or Node.js 24+ (matching package.json).

```powershell
npm ci
# Only copy if .env.local does not already exist:
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3000. No API key or database connection is needed to render
the homepage or record audio. Local secrets belong in `.env.local`, which Git ignores.
Never use `NEXT_PUBLIC_` for database credentials or provider API keys.

## PostgreSQL setup

Use an existing local PostgreSQL installation. Create an empty development
database named `thread` using your PostgreSQL account (for example through pgAdmin
or `createdb -U <your-user> thread`). Set `DATABASE_URL` in `.env.local`:

```text
postgresql://USER:PASSWORD@localhost:5432/thread?schema=public
```

Replace USER and PASSWORD locally; URL-encode special characters in credentials.
Do not paste credentials into chat or commit them. Prisma CLI loads `.env.local`
through `@next/env`, using the same loading rules as Next.js.

```powershell
npm run db:validate
npm run db:check
```

`db:validate` checks the Prisma configuration without connecting to the database.
`db:check` connects and runs only `SELECT 1`; it creates no tables and changes no
data. An accepting PostgreSQL port does not prove that credentials or the database
name are correct. Missing credentials cause an explicit setup message.

There are deliberately no models or migrations yet. We will add the Thought
model, generate the Prisma client, and introduce the shared server-side client
when we implement persistence in Milestone 4.

## Checks

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

`typecheck` generates Next.js route types before running TypeScript, so it also
works on a fresh checkout. After building, `npm start` serves the production app.

### Dependency limitations

The current Next.js React lint plugin requires ESLint 9; ESLint 10 fails while
loading its rules. ESLint 9 is pinned for compatibility despite its npm support
warning. Upgrade when the bundled plugins support ESLint 10.

At foundation setup, npm audit reports four high-severity findings in Prisma's
development dependency tree (`deepmerge-ts` and `mysql2`, propagated through
Prisma). No application route invokes those tools. The suggested automatic fix
downgrades Prisma to version 6; do not apply `npm audit fix --force` blindly.
Recheck patched Prisma releases before deployment.

## File ownership and debugging

- `app/page.tsx`: homepage content; start here for page changes.
- `app/layout.tsx`: document shell and metadata.
- `app/globals.css`: Tailwind import and global styles.
- `next.config.ts`: disables automatic rewriting of our user-owned `AGENTS.md`.
- `components/capture/VoiceRecorder.tsx`: recording, transcription, local AI request,
  raw/AI display, retry handling, and resource cleanup.
- `app/api/transcribe/route.ts`: multipart upload validation and HTTP responses.
- `lib/speech/index.ts`: provider-independent `transcribeAudio(audio)` entry point.
- `lib/speech/elevenlabs.ts`: server-only ElevenLabs request and response validation.
- `lib/speech/errors.ts`: safe error messages and HTTP status mapping.
- `tests/transcription.test.ts`: mocked route/provider tests; never calls ElevenLabs.
- `app/api/process/route.ts`: validates transcript requests and returns structured thoughts.
- `lib/ai/index.ts`: provider-independent `structureThought(transcript)` entry point.
- `lib/ai/ollama.ts`: local Ollama request, prompt, response parsing, and safe errors.
- `lib/ai/schemas.ts`: Zod contract and cross-field rules for structured thoughts.
- `tests/structured-thought.test.ts`: mocked route/Ollama contract and failure tests.
- `scripts/evaluate-ai.ts`: repeatable semantic quality cases against the real local model.
- `prisma/schema.prisma`: database provider and future data models.
- `prisma.config.ts`: Prisma CLI configuration and environment loading.
- `scripts/check-db.mjs`: read-only PostgreSQL connectivity diagnostic.
- `.env.example`: required variable names without secrets.

Current capture flow: microphone → MediaRecorder chunks → Blob →
`POST /api/transcribe` → ElevenLabs → raw transcript → `POST /api/process` →
Ollama/Gemma → Zod-validated structured thought → UI.
The Blob also has a local object URL for playback. Thread does not persist either
audio or transcripts yet; refreshing or leaving loses them. Recording again
replaces them. Audio is sent to ElevenLabs, so it is no longer browser-only.
The database check is a separate CLI flow: `.env.local` → PostgreSQL → `SELECT 1`.

## Verify voice capture (Milestone 1)

1. Run `npm run dev` and open http://localhost:3000. Remote access requires HTTPS
   for microphone permission; an ordinary HTTP LAN address will not work.
2. Press **Record a thought** and allow microphone access. Say a short sentence.
3. Press **Stop recording**. Confirm the browser's active microphone indicator stops.
4. Play the audio and confirm your sentence is audible. Expand **Recording details**
   and confirm a nonzero Blob byte count and an audio MIME type.
5. Press **Record again**, capture a different sentence, and confirm playback is
   replaced with the new clip (wait for transcription to finish or fail first).
   Refresh and confirm the preview disappears.
6. Block microphone permission in the browser's site settings and retry. Confirm
   an actionable error appears. Allow permission again and confirm recording recovers.
7. Leave or reload the page during recording and confirm the microphone is released.
   Also try leaving while the permission prompt is pending.

For capture failures, start in `VoiceRecorder.tsx` and the browser's microphone
permissions. The client component owns browser APIs because these cannot run on
the Next.js server. Blob assembly occurs in `onstop`, after the final
`dataavailable` event; assembling it immediately after calling `stop()` can lose
audio. Object URLs are released when replaced or when the component unmounts.

If the page fails, inspect the terminal running `npm run dev`. For a database
failure, start with `npm run db:check`, the PostgreSQL service, database name, and
local credentials. For local AI failures, start with Ollama and `lib/ai/ollama.ts`.

## Transcription setup and verification (Milestone 2)

Set `ELEVENLABS_API_KEY` in `.env.local` using an ElevenLabs key with speech-to-text
access, then restart the dev server. Keep it server-side; no provider SDK is needed.
We use the documented `POST https://api.elevenlabs.io/v1/speech-to-text` endpoint
with `model_id=scribe_v2`, automatic language detection, and audio event tags off.
See https://elevenlabs.io/docs/api-reference/speech-to-text/convert.

1. Record a short sentence, then stop. Confirm **Transcribing…** appears.
2. Confirm the sentence appears under **USER SAID · TRANSCRIPT**, and compare it
   with your audio. Speech recognition can make mistakes; no AI rewriting occurs here.
3. Record another sentence and confirm it replaces the previous audio/transcript.
4. With the key temporarily removed and the server restarted, confirm a helpful
   setup error appears and audio playback remains available. Restore the key,
   restart, and use **Retry transcription** if the same page is still open.
5. Refresh and confirm neither recording nor transcript persists yet.

Contract: `POST /api/transcribe`, multipart field `audio` containing a file up to
10 MiB. Success: `{ "transcript": "..." }`. Failure: `{ "error": "..." }` with
400 (bad upload), 413 (too large), 415 (unsupported MIME type), 422 (unreadable audio
or no speech), 429 (provider limit), 502 (provider/network/response failure),
503 (missing/rejected credentials), or 504 (timeout). Responses are not cached.
Multipart overhead is bounded separately at 64 KiB; the body stream is checked
even when Content-Length is absent. MIME checking is metadata validation, not
proof that a file contains valid audio.

The provider request times out after 60 seconds; the browser waits up to 75 seconds.
Retry is explicit to avoid automatically repeating billable requests. Leaving the
page aborts the browser request; a provider request already sent may still finish.
No audio, transcript, key, or provider error body is written to application logs.
This unauthenticated development endpoint is for the local MVP, not public deployment.

`npm test` runs the route with a mocked provider using Node's test runner and `tsx`.
It checks payload boundaries, malformed uploads, missing credentials, exact text
preservation, malformed responses, provider errors, and timeouts. It does not prove
real microphone capture, provider credentials, or transcription accuracy.

Debug in order: browser Network tab (`/api/transcribe` status), route upload checks,
then `lib/speech/elevenlabs.ts` and local key/account configuration.

## Local Gemma setup and verification (Milestone 3)

Install Ollama and download the local model once with `ollama pull gemma3:4b`.
Ollama must be running while Thread processes thoughts. `OLLAMA_BASE_URL` and
`OLLAMA_MODEL` in `.env.local` are optional unless you use a different server or
model. No Gemma API key is required, and the transcript sent to `/api/process`
stays on the machine. ElevenLabs transcription is still a cloud request.

1. Run `ollama list` and confirm `gemma3:4b` appears, then start Thread.
2. Record a messy thought with an action and a question. Confirm the raw text remains
   under **USER SAID** and a separate title, summary, categories, action, and question
   appear under **AI INTERPRETED**.
3. Compare the interpretation with the recording. It should preserve meaning without
   adding facts. The first CPU inference can be slower while Ollama loads the model.
4. To test the unavailable-server path on Windows, fully quit the Ollama background
   app from its system-tray menu. Do not run an `ollama` CLI command afterward because
   the installed Windows application may launch again. Use the passive PowerShell check
   `Test-NetConnection 127.0.0.1 -Port 11434 -InformationLevel Quiet`; it should return
   `False`. Record or use **Retry local AI processing** and confirm a useful connection
   error appears without losing the transcript. Reopen Ollama and retry successfully.
   Running `ollama stop gemma3:4b` is not sufficient: it only unloads the model, and the
   still-running server automatically loads it again on the next request. For a fully
   deterministic test, temporarily set `OLLAMA_BASE_URL=http://127.0.0.1:11435` in
   `.env.local` and restart Next.js, then restore port `11434` afterward.
5. Run `npm run ai:eval` to inspect three repeatable semantic cases. Tests verify the
   schema and error behavior; this evaluation is where you judge meaning and usefulness.

Contract: `POST /api/process` with JSON `{ "transcript": "..." }`. Success returns
`{ "structuredThought": { ... } }`; failures use `{ "error": "..." }`. The route
accepts transcripts up to 10,000 characters, calls Ollama's local `/api/chat`, requests
schema-constrained JSON, then validates the result again with Zod. Debug in order:
browser Network tab (`/api/process`), the terminal running Next.js, Ollama status/model,
`lib/ai/ollama.ts`, then `lib/ai/schemas.ts`.

## Your practice challenges

Search for `CHALLENGE` and `TODO(you)` in the source. These are optional exercises
on top of the working milestone; their solutions are intentionally left to you:

- `VoiceRecorder.tsx`: add Copy transcript with success/failure feedback.
- `VoiceRecorder.tsx`: add Copy interpretation while keeping it distinct from raw text.
- `tests/transcription.test.ts`: add the exactly-10-MiB acceptance test, complementing
  the existing one-byte-over rejection test. Use the mocked provider.
- `scripts/evaluate-ai.ts`: beginner exercise—add one string to the `cases` array,
  run the evaluation, and check whether the action preserves its stated timing.

The prompt-injection request test is completed in `tests/structured-thought.test.ts`.
It verifies request construction using a mock; it does not prove the model will always
ignore instructions embedded in a transcript.
