# Public Thread demo

## Milestone 1: visitor ownership

Implemented locally; production remains private until spending controls are ready.
`THREAD_ACCESS_MODE` defaults to `private`. `public-demo` requires an independent
random `THREAD_SESSION_SECRET` of at least 32 characters. Never commit its value.

`lib/workspace.ts` signs and validates a 30-day browser cookie. `proxy.ts` issues
it on a page visit and forwards the signed cookie to the page's first render.
APIs require an existing valid cookie; they never accept a workspace from a
body, query parameter or custom header. Writes require a matching Origin.

The migration adds nullable `Thought.workspaceId` and its timeline index. Old
records remain null-owned and are visible only in private/local mode. Public
records are scoped in timeline/detail/save, embedding reads and updates, SQL
retrieval (both source and candidates), and connection candidate loading.
All data helpers reject missing ownership in public mode. Cross-owner IDs yield
404; retries preserve the original row and never transfer ownership.

Flow: page visit -> signed cookie -> server-resolved workspace -> owned thought
-> owned embeddings -> owned candidates -> Gemma connection analysis.

Anonymous ownership is a browser capability, not a user account. Anyone with
the cookie can access its workspace. Cookies expire after 30 days and clearing
them loses access. This milestone does not automatically delete saved records.
The demo page advises against sensitive content and provides two recording prompts.

Validation: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
`tests/workspace.test.ts` checks cookie forgery, expiry, duplicate cookies, secret
rotation, middleware bootstrap, same-origin writes, cross-owner API requests,
and parameterized ownership predicates for retrieval/embedding updates.

October 4 validation: all 104 tests, lint, typecheck and production build passed.
The ownership migration was applied only to the separate localhost database.
`node scripts/verify-workspaces.mjs` starts a temporary production server on port
3103 and exercises two independent cookie sessions against that database. It
verifies save retries/conflicts, timeline/detail/API isolation, actual pgvector
retrieval isolation, vector reuse, legacy record exclusion and forged cookies.
It uses only synthetic fixtures, supplies no usable provider keys, removes its
own fixtures and stops its server. Fixture timestamps are assigned explicitly
to exercise the existing earlier-only retrieval rule. Build before running it.
It refuses to target a non-localhost database.

First debug cookie issuance/validation in `lib/workspace.ts`, then the scope
passed by the failing entry point. Check the ownership migration before diagnosing
database errors. Disable public mode by setting `THREAD_ACCESS_MODE=private`;
retain the configured private password.

Learner exercise: the `CHALLENGE` / `TODO(you)` comment beside the homepage's
two example prompts asks you to replace them with examples from your own studies.
Only edit those two text nodes; no TypeScript logic needs changing.

## Milestone 2: spending controls

Implemented locally; production remains private. The second migration creates
`UsageCounter` in the existing database. `lib/usage.ts` takes a PostgreSQL
transaction advisory lock, checks/increments global and visitor counters, and
commits before starting the provider call. A denial rolls back both increments.
The lock lasts only for database work, not transcription or inference. Storage
failures return 503 without provider calls. Reservations are never refunded after
a provider call might have started, and there are no automatic paid retries.

| Operation | Visitor allowance | Global allowance |
| --- | --- | --- |
| Transcription | 5 attempts/calendar hour | 30 attempts/calendar day |
| Structuring | 10 calls/calendar hour | 60 calls/calendar day |
| Embedding | 10 chunks/calendar hour | 60 chunks/calendar day |
| Connection inference | 10 calls/calendar hour | 60 calls/calendar day |
| Saving | 50 thoughts/workspace total | 1,000 new thoughts/calendar day |

Both UTC and IST calendar windows are checked and incremented in the same
transaction. Either exhausted calendar rejects the request and rolls back all
increments. `THREAD_QUOTA_TIMEZONE=UTC|Asia/Kolkata` selects the display timezone
only; changing it cannot refresh allowance. IST is the default. Its midnight is
18:30 UTC, and its hourly windows begin at UTC half-hours. The usage endpoint
includes both sets of reset timestamps. Time-limited denials return 429 with `Retry-After`;
the permanent 50-thought workspace cap returns 429 without a reset promise.
Save retries consume no extra slot, even at capacity. Save limits and inserts
share one transaction. Owned vector reuse and empty candidate sets call no
provider and consume no provider budget.

`lib/speech/trim-audio.ts` resolves the installed `ffmpeg-static` executable,
decodes at most 60 seconds with a 15-second timeout and one processing thread,
allows only pipe protocols, bounds output to 1,920,000 PCM bytes, and wraps that
mono 16 kHz PCM in a WAV header. Malformed audio and missing decoders fail before
reservation; no unrestricted-audio fallback exists. Uploads remain bounded to
10 MB. Every accepted transcription attempt reserves one full minute, even for
short clips or uncertain failures. This is a conservative audio allowance, not
a calculation of ElevenLabs credits or billing minimums.

`THREAD_PUBLIC_AI_ENABLED=true` must be explicitly configured to permit public
provider calls. Set it to false and restart/redeploy to pause new calls (already
running calls are not cancelled); saved thoughts and compatible vector reuse
remain available. Private mode retains its existing behavior. The browser stops
at 60 seconds, but server trimming enforces the limit against direct callers.

`GET /api/usage` requires the signed workspace cookie and returns recording
attempts remaining, enabled state, timezone, reset timestamps, and the 60-second
limit. Responses are not cached. `components/capture/DemoUsage.tsx` displays this
information beside recording and refreshes it when capture status changes.
Actual admission remains a transaction on the server; a displayed allowance is
not a reservation. No cookies, workspace IDs, thoughts or audio are exported to
Sentry. Expected quota/pre-index denials produce no generic failure issue.

October 4 validation: 113 tests passed; lint, TypeScript and the production build
passed. Real FFmpeg tests cover short/70-second input, malformed input, missing
decoder, and timeout. Mocked provider tests cover no calls on denials, retained
failed-call allowance, actual embedding chunk counts and no inference for empty
candidates. `tests/observability.test.ts` verifies expected denials produce spans
without failure events.

After local migrations, run
`node --conditions=react-server --import tsx scripts/verify-usage.ts` to check real
PostgreSQL concurrency: one of 12 requests wins the last global slot in UTC and
IST, visitor rejection rolls back the global increment, and counters survive a
fresh application connection. It uses isolated future counter windows, removes
only its fixtures, refuses non-localhost databases, and calls no providers.
`node scripts/verify-workspaces.mjs` also verifies the real usage endpoint, paused
AI, 50-thought capacity, and retries at capacity. Synthetic saves consume the
normal local save allowance; their thoughts are cleaned up afterward.

Debug allowances in `lib/usage.ts` and the matching stage/window rows; debug
decoding in `lib/speech/trim-audio.ts`. Do not reset counters to resolve a provider
timeout. Old counter rows are retained for inspection; no scheduled cleanup
service is introduced. The reservation explanation exercise is beside
`reserveProviderCall` in `lib/usage.ts`.

## Remaining milestone

Milestone 3 configures the dedicated 20,000-credit ElevenLabs key, deploys while
private, verifies migrations/FFmpeg, then enables public access. Do not enable
public production access before these controls and live checks are complete.

## Milestone 3 rollout procedure

The build runs `npm run audio:verify` before Next.js compilation. This uses the
same decoder as production to convert a synthetic 70-second WAV to a 60-second
mono 16 kHz WAV. It calls no providers and fails the build if the platform's
FFmpeg executable is unavailable. Render's Linux build log must include its PASS.

1. Create a dedicated ElevenLabs key restricted to speech-to-text with a
   20,000-credit limit. Configure `ELEVENLABS_API_KEY` privately in the service's
   Render Environment tab. Keep its value out of Git, screenshots and messages.
2. Commit/push code and deploy with `THREAD_ACCESS_MODE=private` and
   `THREAD_PUBLIC_AI_ENABLED=false`. Startup applies both migrations before
   accepting requests. Existing private thoughts remain null-owned.
3. Verify private login and protected APIs, Linux decoder build evidence, and
   migration startup logs. Configure a new random `THREAD_SESSION_SECRET`.
4. Deploy `THREAD_ACCESS_MODE=public-demo`, initially with AI still paused. Run
   `node scripts/verify-public-deployment.mjs https://thread-e5b3.onrender.com/ --paused`.
5. After confirming the capped key, enable `THREAD_PUBLIC_AI_ENABLED=true` and
   redeploy. Run the same script with two related synthetic WAV file paths instead
   of `--paused`. This makes two transcription/structuring/embedding calls and
   one connection call, checks visitor isolation, and consumes normal allowance.
   It never retries a paid request. Its ignored evidence JSON contains synthetic
   results but no cookies or keys. Open a fresh browser for submission screenshots.

Rollback: set `THREAD_ACCESS_MODE=private` and redeploy; the retained private
password restores access to the old private timeline. To pause only public AI,
set `THREAD_PUBLIC_AI_ENABLED=false` and redeploy; saved public thoughts remain
readable. Do not undo ownership migrations or clear counters. Requests already
in flight can finish. Changing/rotating the session secret loses visitor access
to existing anonymous workspaces, so retain it for normal deployments.

Inspect Render Events/build logs for decoder or migration failures, then Sentry
Issues for `Thread allowance failed` (database reservation/storage failures) or
the failing provider stage. Expected quota denials and disabled AI create no
generic failure issue; database failures are reported with a fixed, filtered
message and never include database errors, URLs, visitor IDs or credentials.

### October 4 private production verification

Implementation commit `c113066` is pushed and deployed on
`https://thread-e5b3.onrender.com/`. Active deployment:
`dep-db19cvenfi0s7396772g`. Both ownership and usage migrations applied successfully
on production; Render's Linux build printed the FFmpeg trimming PASS. The private
HTTPS verification script passed after migration: login/logout, protected pages
and APIs, liveness, and cross-site write rejection. The post-rollout error-log
query returned no error-level entries for the rollout window.

Local checks now pass 114 tests, including an explicit display-timezone bypass
regression test. Build, lint, typecheck, the real PostgreSQL cross-calendar race
check, and the HTTP workspace/capacity check passed. A random session signing
secret is configured privately on Render. No provider calls were made during
this private rollout. Public mode and AI remain disabled pending confirmation
of the dedicated capped ElevenLabs key. Public paid workflow verification and
submission screenshots have not yet been completed.

### October 5 public production verification

Active public deployment `dep-db19kt8u01pc73dfg0a0` is live with AI enabled.
The AI-paused public check first passed secure independent workspace cookies,
forged-cookie and cross-origin rejection, both UTC/IST reset calendars, and no
allowance consumption on the disabled request. After enabling AI, two synthetic
WAV recordings each passed ElevenLabs transcription, Google-hosted Gemma
structuring, save/retry idempotency, Google embedding/reuse, and cross-visitor
404 isolation. Vector retrieval linked the two deliberately related thoughts.

Gemma then returned a schema-valid abstention (`hasConnection: false`) for the
connection explanation. This is an allowed model decision, not an infrastructure
failure: the endpoint completed successfully, retrieval had already found the
related thought, and Render recorded no error-level logs. The verification was
not automatically retried, so the two audio reservations and one connection
reservation remain conservatively consumed. The verifier now accepts either a
fully populated connection or a null-field abstention while still rejecting an
invalid response. A fresh evaluator browser displayed five available visitor
recording attempts, both reset calendars, the 60-second limit, privacy warning,
suggested related prompts, and an empty isolated timeline.
