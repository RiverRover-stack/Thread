# Thread

Don't interrupt a thought to save it.

## Current scope

Phase 2 is complete: original transcripts are embedded locally with EmbeddingGemma,
stored in PostgreSQL using pgvector, and searched for relevant earlier thoughts.
The detail page prepares missing embeddings and displays related thought cards.
The Next.js homepage captures microphone audio, provides
local playback, and sends the recording to ElevenLabs for transcription after
stopping. It then sends the raw transcript to a local Gemma model through Ollama
and validates the structured thought with Zod. It automatically saves the original
transcript and interpretation to PostgreSQL. The homepage and `/thoughts` display
saved thoughts newest first. Each title opens a saved detail page with the original
transcript clearly separated from the AI interpretation.
See PROJECT_SPEC.md for product scope and AGENTS.md for our
collaboration rules.

For a diagram-led implementation walkthrough, see
[Phase 2 visual handoff](docs/PHASE_2_HANDOFF.md) or its
[HTML reading copy](docs/PHASE_2_HANDOFF.html).

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

The `Thought` model and initial migration are now included. After configuring
`DATABASE_URL`, run `npm run db:check`, `npm run db:migrate`, and `npm run db:generate`.
`db:migrate` applies committed migrations; it does not reset existing data.
`build` and `typecheck` also generate the client, whose files are ignored by Git.

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
- `lib/db/client.ts`: lazily creates and reuses Prisma's PostgreSQL connection pool.
- `lib/db/thoughts.ts`: reads only the timeline fields in deterministic newest-first order.
- `components/thoughts/ThoughtTimeline.tsx`: renders saved thoughts, empty state, and database failure feedback.
- `app/thoughts/page.tsx`: standalone timeline with a link back to capture.
- `app/thoughts/loading.tsx`: loading feedback during timeline navigation.
- `app/thoughts/[id]/page.tsx`: loads one saved thought and handles database failures.
- `app/thoughts/[id]/not-found.tsx`: feedback for invalid or missing thought IDs.
- `components/thoughts/ThoughtDetail.tsx`: original transcript and AI interpretation sections.
- `app/api/thoughts/route.ts`: validates and saves both versions with retry-safe IDs.
- `prisma/migrations/`: versioned SQL that creates the actual database table.
- `tests/persistence.test.ts`: mocked database tests for validation and retry behavior.
- `scripts/verify-persistence.ts`: real database creation/read check across separate processes.
- `tests/structured-thought.test.ts`: mocked route/Ollama contract and failure tests.
- `scripts/evaluate-ai.ts`: repeatable semantic quality cases against the real local model.
- `prisma/schema.prisma`: database provider and future data models.
- `prisma.config.ts`: Prisma CLI configuration and environment loading.
- `scripts/check-db.mjs`: read-only PostgreSQL connectivity diagnostic.
- `.env.example`: required variable names without secrets.

Current capture flow: microphone → MediaRecorder chunks → Blob →
`POST /api/transcribe` → ElevenLabs → raw transcript → `POST /api/process` →
Ollama/Gemma → Zod-validated structured thought → `POST /api/thoughts` → PostgreSQL → save confirmation.
The Blob also has a local object URL for playback. Audio and the current screen's
preview are temporary; saved transcripts and interpretations remain in PostgreSQL.
Recording again replaces the preview. Audio is sent to ElevenLabs.
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

## Persistence (Milestone 4)

Create a database named `thread` using pgAdmin and your existing PostgreSQL account.
Put its connection URL in `.env.local`; do not commit or share your password.
PostgreSQL must be running, and migrations must be applied before saving can work.

```powershell
npm run db:check
npm run db:migrate
npm run db:generate
npm run dev
```

`POST /api/thoughts` accepts `{ id, rawTranscript, structuredThought }`. The ID is a
UUID generated once per recording. The server validates the payload again with Zod
and uses a Prisma `upsert`: insert a new row, or return the existing row with no
updates. This prevents duplicate saves when a response is lost and the user retries.
An existing ID with different content returns 409 rather than replacing the original.
`createdAt` comes from PostgreSQL; clients cannot set it. Successful responses contain
`{ thought }`, including the stored timestamp. Failures leave the capture preview
available and offer **Retry saving**, without another ElevenLabs or Gemma call.

To verify persistence without waiting for speech or inference:

```powershell
npm run db:verify
# Use the ID printed above in a new terminal/process:
npm run db:verify -- THOUGHT_ID
```

The first command intentionally inserts one synthetic verification thought. The
second only reads it. You can also copy a real thought ID from the browser Network
tab's `/api/thoughts` response and read that ID after refreshing/restarting Thread.
The capture preview clears on refresh, but the row remains and appears in the timeline.

Debug persistence in order: `/api/thoughts` response in the Network tab, `npm run
db:check`, `npm run db:migrate`, then the save route and `lib/db/client.ts`. The
mocked tests do not establish real database connectivity; the CLI verification does.
No new practice challenges are assigned for this milestone.

## Timeline (Milestone 5)

The homepage and `/thoughts` query PostgreSQL using a server component. No separate
GET API is needed: the server can use Prisma directly. Both pages render on each
request rather than freezing the list at build time. After saving, the recorder calls
`router.refresh()` to request fresh server-rendered content while preserving its
browser state. The query orders by `createdAt` descending, then ID descending to
resolve identical timestamps consistently. Card timestamps explicitly use UTC.

Verify: create several thoughts, confirm newest first on both pages, refresh, and
restart Next.js. Saved thoughts should remain visible. An empty database shows a
helpful empty state; an unavailable database shows an error with a retry link.
Each card title links to its saved detail page.
Debug list problems in `lib/db/thoughts.ts`, then `ThoughtTimeline.tsx` and the
Next.js terminal. If saving succeeds but the list stays stale, check `router.refresh()`.
With Thread running on localhost:3000, `npm run timeline:verify` creates three
temporary fixtures, checks query and rendered card order on both pages, and removes
only those fixtures in a `finally` block.

## Thought detail (Milestone 6)

Open a timeline title or **Open saved thought** after recording. `/thoughts/[id]`
awaits the URL parameters and uses `getThought(id)` to validate the UUID and query
one row directly on the server. It does not call transcription or Gemma again.
Invalid or missing IDs show **Thought not found**; a database failure shows separate
retry feedback so it is not mistaken for a deleted record.

The detail component displays the original transcript using `whitespace-pre-wrap`
to retain spaces and line breaks. React escapes its text, so HTML-looking content
cannot execute. The **AI INTERPRETED** section contains the summary, categories,
possible action, and question. Absent nullable fields display explicit fallback text.
Titles are identified as AI-generated; creation times use UTC, matching the timeline.

Manual check: open a saved thought, compare both sections with the capture preview,
refresh its direct URL, and use **Back to timeline**. Try `/thoughts/invalid-id`
and a valid UUID that does not exist. With Thread running, `npm run detail:verify`
checks real detail responses using temporary fixtures and removes only those fixtures.
`npm test` also verifies invalid IDs never query the database and distinguishes
missing records from database failures. Start debugging in `getThought` in
`lib/db/thoughts.ts`, then the detail page, then `ThoughtDetail.tsx` for presentation.
No new practice challenges are assigned while we finish the core capture flow.

## Semantic-memory foundation (Phase 2, Milestone 1)

Phase 2 uses the existing local Ollama server and PostgreSQL database.
`OLLAMA_MODEL=gemma3:4b` continues to structure thoughts. The separate
`OLLAMA_EMBEDDING_MODEL=embeddinggemma:300m` selects an embedding model, which
returns numbers representing text meaning. This setting defaults to the value
shown here, so existing `.env.local` files need no edits unless overriding it.
No npm dependencies are added.

### EmbeddingGemma setup

Keep Ollama running, then download the model once:

```powershell
ollama pull embeddinggemma:300m
npm run memory:check:embedding
```

The download is approximately 622 MB. EmbeddingGemma requires Ollama 0.11.10 or
newer; the inspected local server is 0.32.5. The diagnostic posts a fixed synthetic
sentence to local `/api/embed`, requests 768 dimensions, disables truncation, and
checks for one nonzero vector of finite numbers. It does not read saved thoughts,
print vectors, or save embeddings. Its timeout is 120 seconds to accommodate the
first model load. Success proves inference and output shape, not retrieval quality.
See the [model documentation](https://ollama.com/library/embeddinggemma) and
[embedding API](https://docs.ollama.com/api/embed).

### pgvector setup on Windows

The local foundation is verified with PostgreSQL 18, pgvector 0.8.7, Visual Studio
2022 C++ Build Tools, and EmbeddingGemma through Ollama. pgvector was built from
the official `v0.8.7` tag and enabled in the existing database. The two saved
thoughts were unchanged, verified by comparing their count and content fingerprint
before and after enabling the extension. For a fresh Windows setup, PostgreSQL
development headers and the MSVC x64 toolchain are required before building.

Use the existing PostgreSQL installation and database. Install Visual Studio
Build Tools with **Desktop development with C++**, including the MSVC x64 tools
and Windows SDK. Follow the [official Windows instructions](https://github.com/pgvector/pgvector#windows).
This is a system prerequisite, not an application framework or another database.

In an administrator **x64 Native Tools Command Prompt**, build the pinned extension
release below. These are cmd commands, not PowerShell commands. The example uses
a new temporary source folder; if it already exists, inspect it before reusing it.

```bat
set "PGROOT=C:\Program Files\PostgreSQL\18"
cd /d "%TEMP%"
git clone --branch v0.8.7 --depth 1 https://github.com/pgvector/pgvector.git thread-pgvector-0.8.7
cd thread-pgvector-0.8.7
nmake /F Makefile.win
nmake /F Makefile.win install
```

This installs extension files into PostgreSQL's installation folders. In pgAdmin,
open the Query Tool for the existing `thread` database and enable the extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Enabling the extension adds its database types/functions; it does not modify the
Thought table or existing thoughts. The vector-column migration belongs to
Milestone 4 and will also declare the extension prerequisite for fresh databases.
Do not reset the database. If the build/install fails or requires a different
database setup, stop and agree on a fallback before proceeding.

### Readiness checks and debugging

```powershell
npm run memory:check:db
npm run memory:check:embedding
npm run memory:check
```

The database check runs a read-only transaction. It distinguishes missing
extension files from an extension that has not been enabled in the configured
database, then verifies cosine distance using constant vectors without creating
tables or inserting rows. The full command checks both prerequisites even when
one fails, and exits unsuccessfully if either is unavailable. Ollama may load the
model into memory while checking inference.

Data flow: `.env.local` → PostgreSQL extension metadata / constant distance query;
fixed sample → local Ollama → validate vector shape → readiness message.
Debug first in `scripts/check-semantic-memory.mjs`, then PostgreSQL extension
installation or Ollama model configuration. `package.json` exposes the command;
`.env.example` lists the independent embedding model setting.

Practice: edit only `sampleText` in the readiness script as described by its
`CHALLENGE` / `TODO(you)` comments, then run the embedding-only check. Different
text should still produce 768 dimensions. Leave the implementation to yourself.

## Embedding adapter (Phase 2, Milestone 2)

Server code calls `embedText(text): Promise<number[]>` through `lib/embeddings/index.ts`.
`Promise` means the caller awaits the network operation; `number[]` means an array
of numbers. TypeScript checks this contract during development, while Zod checks
the actual response at runtime. The adapter is server-only, like the existing
speech and structuring adapters. It has no browser endpoint yet.

`lib/embeddings/ollama.ts` sends the input text to the existing local Ollama server
with EmbeddingGemma's sentence-similarity prefix. Leading/trailing spaces and line
breaks in the input are preserved. The prefix is applied once by the adapter;
callers supply ordinary text. `OLLAMA_EMBEDDING_MODEL` defaults to `embeddinggemma:300m`
and remains independent from `OLLAMA_MODEL`, which still selects Gemma structuring.
The request disables truncation and times out after 120 seconds, including response
reading. Long transcripts use the processor described below.

`lib/embeddings/schemas.ts` validates one 768-dimensional vector of finite numbers
with finite, nonzero magnitude. `lib/embeddings/errors.ts` provides safe errors with
status codes: 400 for invalid caller input, 422 for rejected provider input,
429 for a busy server, 502 for provider/response failures, 503 for missing models
or connection failures, and 504 for timeout. Provider error bodies, input text,
and vectors are not logged. Responses are not cached and retries are explicit.

```powershell
npm test
npm run embeddings:eval
```

`tests/embeddings.test.ts` mocks the network and verifies configuration, exact text
preservation, request options, vector validation, and safe failures. It never calls
Ollama. `scripts/evaluate-embeddings.ts` uses the real adapter with synthetic
samples and reports dimensions, magnitude, and elapsed time without printing text
or vectors. Neither check writes to the database. These checks establish adapter
correctness and working inference; semantic ranking will be evaluated with retrieval.

Data flow: caller text → `embedText` → local `/api/embed` → Zod validation → `number[]`.
Debug first in the Ollama adapter, then check `npm run memory:check:embedding`, the
local server, and embedding model configuration. An optional exercise in the
evaluation script asks you to add one sample to the existing `cases` array and
verify that its output still has 768 dimensions.

## Transcript embedding processing (Phase 2, Milestone 3)

`lib/embeddings/transcript.ts` owns `embedTranscript(rawTranscript): Promise<number[]>`.
It accepts nonblank text up to the existing 10,000-character save limit and splits
a working copy into chunks of at most 1,000 UTF-8 bytes with up to 100 bytes of
overlap. Unicode code points stay intact, including emoji surrogate pairs. Chunk
boundaries may fall inside words or sentences; overlap retains nearby context.
The original string, spaces, and line breaks are not rewritten. Whitespace-only
chunks are omitted from inference because they carry no meaning.

Each chunk goes sequentially through `embedText`; that adapter adds the
sentence-similarity prefix once and disables silent truncation. The processor
averages corresponding coordinates of the returned 768-dimensional vectors, then
divides each coordinate by the mean vector's magnitude to produce a unit vector.
It rejects invalid input, propagates failed chunks without returning partial
results, and rejects a zero mean rather than dividing by zero. It performs no
database writes or automatic retries. A caller retries the whole operation after
a failure; each chunk uses the adapter's 120-second timeout.

`EMBEDDING_RECIPE_VERSION = 1` identifies this combination of chunking, task
formatting, averaging, and normalization. Changing those rules requires a version
bump and later regeneration of stored vectors. A single averaged vector keeps
storage simple but can weaken retrieval for thoughts containing unrelated topics;
semantic quality still needs real retrieval evaluation.

```powershell
npm test
npm run embeddings:eval
```

`tests/transcript-embeddings.test.ts` verifies byte boundaries, Unicode, full text
coverage, overlap, sequential requests, normalized aggregation, and failure paths
with mocked Ollama responses. The evaluation script retains your existing samples
and also exercises a synthetic long transcript through the real processor. It
reports chunk count, dimensions, magnitude, recipe version, and timing without
printing the transcript or vector. This verifies the processing path, not semantic
ranking or relevance.

Data flow: raw transcript → bounded chunks → local embeddings → coordinate mean
→ unit vector. Debug chunk boundaries or aggregation in `transcript.ts`; provider
failures still start in `lib/embeddings/ollama.ts`. Your optional exercise is to add
one multilingual fixture to the existing test `cases` array, following its
`CHALLENGE` / `TODO(you)` comments, then run `npm test`.

## Vector persistence and indexing (Phase 2, Milestone 4)

The additive migration `20261003010000_add_thought_embedding` enables pgvector and
adds nullable `embedding vector(768)`, `embeddingModel`, and `embeddingVersion`
columns. Existing thought content is retained; a database constraint keeps the
vector and metadata either all present or all absent. Prisma represents the vector
as `Unsupported`, so parameterized SQL in `lib/db/embeddings.ts` handles it. The
ordinary save/detail projections explicitly preserve the original public fields.

`lib/embeddings/index-thought.ts` coordinates indexing: saved ID → stored transcript
→ `embedTranscript` → vector write. `POST /api/thoughts/[id]/embedding` accepts the
ID in the URL and ignores client content; it returns `{ id, indexed: true, reused }`.
Invalid/missing IDs return 404. Compatible model/version metadata reuses the vector
without inference. Concurrent requests may both infer, but only the first writes
a compatible vector. No transcript or interpretation is overwritten, and vectors
never appear in save/indexing responses. A failed request keeps the saved row intact.

After save confirmation, `VoiceRecorder.tsx` sends a separate indexing request and
keeps recording available. Indexing has separate status and retry feedback. Starting
another recording or leaving aborts the browser request; inference already running
on the server may still finish. Interrupted indexing can be resumed by opening the
saved detail or running backfill. Browser indexing waits up to five minutes; very
long/cold inference may require the CLI backfill instead.

```powershell
npm run db:migrate
npm run db:generate
npm run embeddings:verify
npm run embeddings:backfill
```

The persistence verifier indexes one temporary fixture, retries, reads from a
separate process, and removes only its fixture. Backfill intentionally adds vectors
to existing saved thoughts, scans bounded pages sequentially, skips compatible
records, reports counts only, and exits unsuccessfully if any indexing fails.
Rerun after fixing Ollama or database configuration to resume; completed vectors
are not regenerated. Changing the model tag or recipe version requires backfill.
Replacing model weights under the same tag also requires a recipe-version bump
before backfill, since metadata identifies the configured tag rather than a digest.

Debug in order: indexing response, `memory:check`, migration status, database helpers,
then `index-thought.ts` and the embedding adapter. The optional exercise in
`tests/embedding-persistence.test.ts` adds another invalid-ID case.

## Semantic retrieval (Phase 2, Milestone 5)

`getRelatedThoughts(id)` in `lib/db/thoughts.ts` runs exact cosine search in PostgreSQL.
Cosine similarity is `1 - cosine distance`: higher scores mean more similar vector
directions. It excludes self, equal/later timestamps, absent vectors, and different
model/recipe metadata. It returns at most five results, ordered by similarity, then
creation time descending and ID ascending to resolve ties. No approximate index,
connection generation, or history upload to Gemma is involved.

`GET /api/thoughts/[id]/related` returns `{ relatedThoughts: [{ id, title, summary,
createdAt, similarity }] }` without vectors or raw transcripts. It performs no
indexing writes. Missing IDs return 404, unprepared/incompatible current vectors
return 409, and retrieval/configuration failures return safe errors. Empty matches
are successful responses, distinct from failures.

`RELATED_THOUGHTS_MIN_SIMILARITY` defaults to `0.70` and accepts finite numbers from
0 to 1. It is a tuning parameter, not a probability or confidence percentage.
Model choice and thought content affect useful thresholds. Restart Next.js after
changing environment configuration.

```powershell
npm run related:verify
npm run memory:eval
```

The first command uses controlled vectors to verify real SQL ranking, limits,
thresholds and exclusions. The second indexes synthetic paraphrase, unrelated and
long-transcript examples using the real model, then verifies retrieval. Both remove
only their temporary fixtures. With the current model/default threshold the checked
paraphrase scored about 0.748 and long transcript about 0.730; the unrelated thought
was excluded. This is a small quality check, not broad calibration.

Debug the GET response, configured threshold, indexing metadata and SQL in
`getRelatedThoughts`. Practice: add a malformed configuration example in
`tests/related-thoughts.test.ts` as described by its comments.

## Related thought detail (Phase 2, Milestone 6)

`app/thoughts/[id]/page.tsx` still loads the original thought on the server and
mounts `components/thoughts/RelatedThoughts.tsx` as an independent client section.
The section prepares the current embedding with POST, then reads matches with GET.
Compatible vectors are reused. The original transcript and interpretation remain
readable during loading and failure. Related cards link to older detail pages and
show title, summary and UTC timestamps. Similarity numbers remain internal.

The section distinguishes preparation, retrieval, no matches, preparation failure
and retrieval failure. Its retry repeats POST → GET safely. Leaving or changing
thoughts aborts requests and guards against late responses. The section is keyed
by thought ID so another thought begins with fresh state. Responses are validated
with the shared Zod schemas in `lib/embeddings/response-schemas.ts` before rendering.

```powershell
npm run dev
# In another terminal, with Thread on localhost:3000:
npm run memory:detail:verify
npm run timeline:verify
npm run detail:verify
npm test
npm run lint
npm run typecheck
npm run build
```

The memory detail verifier creates temporary older/newer thoughts, checks the real
detail and indexing/retrieval endpoints, and removes only those fixtures. Browser
verification additionally checks rendered cards, link navigation, the empty state,
missing-model feedback and retry recovery after restoring the model. An unavailable
database is also covered by mocked route tests; no database service is stopped.
Live microphone capture and ElevenLabs accuracy remain manual checks from Phase 1.

Manual acceptance: capture related thoughts in sequence, wait for indexing or use
backfill, open the newer thought and follow an earlier card. Refresh its direct URL.
Check an unrelated thought shows no matches. On embedding failure, verify USER SAID
and AI INTERPRETED remain readable; restore Ollama and retry the related section.

Debug in order: browser Network tab (POST embedding, then GET related), the related
component, indexing coordinator, and retrieval SQL. Practice: add seconds to the
related card's existing `toLocaleString` options, following the in-place hints.

### Commit organization

The remaining implementation is saved in separate milestone commits:
storage/migration/indexing/capture and persistence tests (4),
retrieval/query/configuration and semantic verification (5), then client cards,
shared response validation and detail verification (6). Shared implementation
files were staged by milestone. The visual handoff and setup documentation are
saved separately. Connection generation remains outside semantic memory.
