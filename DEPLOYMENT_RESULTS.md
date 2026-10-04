# Thread deployment verification results

Verified on 4 October 2026. Deployed app: [Thread](https://thread-e5b3.onrender.com).
Application revision: `dc58da5732d0accf9bb858d35870ae4efb56f82c`.

## Automated checks

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm test` | 82 passed; 0 failed, cancelled, or skipped | Schema, adapters, routes, persistence/retrieval contracts, presentation, and access-control tests; providers/database mostly mocked |
| `npm run lint` | Passed | ESLint checks |
| `npm run typecheck` | Passed for hosted-adapter milestone | Prisma generation, Next route types, TypeScript |
| `npm run build` | Passed after password gate | Prisma generation, Next compilation, TypeScript, page generation |
| Render clean build | Passed | Linux install/build of the exact pushed revision with Node 22.13.0 |
| Production migrations | Passed | Both committed migrations applied, including pgvector; no reset or local-data import |
| Render startup | Passed | Next.js listening on `0.0.0.0:10000` |
| Recent Render error logs | No errors returned | Limited to the queried window; not a guarantee that every future request succeeds |

The first gate build exposed two TypeScript errors in test code (read-only NODE_ENV deletion and a headers-object union); both were fixed before the successful build. Sandbox network checks failed and were rerun with approved network access. The first Render creation attempt failed because Render's GitHub app could access only RAG-Eval-Harness; the user added Thread, then creation succeeded.

## Live hosted provider checks before deployment

- `npm run ai:eval`: all four synthetic transcripts structured successfully by Google's hosted Gemma. Reviewed action timing, uncertainty, and reflective/non-actionable output. Calls took approximately 2.1–2.7 seconds. This is a small smoke evaluation, not a broad accuracy benchmark.
- `npm run memory:check:embedding`: selected hosted embedding adapter succeeded.
- `npm run embeddings:eval`: four synthetic texts returned valid 768-dimensional vectors; related pair ranked above unrelated pair. Related similarity: 0.8545; unrelated similarity: 0.7012.
- Long synthetic transcript: three chunks, valid 768-dimensional normalized final vector (magnitude 1). No database writes in these provider evaluations.
- Missing-key readiness/configuration checks failed explicitly as intended, without falling back to local inference.

## Production HTTP access checks

These were checked locally in a running production server, then against the deployed HTTPS app:

| Request | Observed result |
| --- | --- |
| Unauthenticated `/api/health` | 200, expected status JSON |
| Unauthenticated `/`, `/thoughts`, `/api/process`, `/api/thoughts` | 401 |
| Authenticated page | 200 |
| Authenticated POST `/api/process` without JSON content type | 415 |
| Authenticated cross-site POST `/api/process` | 403 |

Mocked gate tests additionally verify missing production configuration fails closed (503), malformed/wrong credentials, the exact health-only exemption, alternate route representations, and each sensitive API's independent check when bypassing the proxy.

## Production end-to-end memory results

Ran:

```text
node --env-file=.env.render scripts/verify-deployment.mjs https://thread-e5b3.onrender.com --write-synthetic
```

The check called deployed APIs, hosted Gemma, Google embeddings, and production PostgreSQL. It preserved raw transcript text, retried the same save ID, indexed each thought, confirmed vector reuse on retry, and loaded each detail page.

| Synthetic input | Production thought ID |
| --- | --- |
| I should benchmark my compressed model on a Raspberry Pi. | `a9f652a8-6d7a-4f7f-948e-1145a62fb795` |
| I enjoyed the rain while walking to the library. | `208bc2d4-1f4b-4580-a8b7-d06393ab8e53` |
| Measure inference latency and memory use on the small deployment device. | `bd33b797-872f-4e8d-a240-b70390433b51` |

For the third thought, retrieval returned the first thought at similarity **0.8545125809602406** and excluded the weather thought. Hosted Gemma returned:

```json
{
  "hasConnection": true,
  "connection": "The current thought's goal to measure inference latency and memory usage is a specific way to execute the broader idea of benchmarking the compressed model on a Raspberry Pi.",
  "implication": "Performing these specific measurements will provide the quantitative data needed to complete the benchmark on the target hardware.",
  "questionToExplore": "What specific metrics for latency and memory usage are most critical for determining if the compressed model is suitable for the Raspberry Pi?"
}
```

The first thought returned `hasConnection: false` because there were no earlier candidates. All three detail pages loaded; all three embeddings were reused on subsequent checks. These fixtures remain in production for review.

## Actual audio transcription

Generated a synthetic WAV with Windows speech synthesis (214,074 bytes), then uploaded it to the deployed `/api/transcribe` endpoint with valid shared credentials. ElevenLabs returned:

> I learn APIs better when I build one tiny request first

The endpoint returned 200 and the expected phrase. This verifies actual deployed transcription access; browser microphone permissions and recording remain a separate manual check.

## Scope and remaining verification

- Production and local databases are separate. Local `.env.local` was not changed; no local thoughts were copied into production.
- Public production database connections are blocked. The app uses its internal URL.
- HTTP health check configured as `/api/health`; automatic deploys disabled.
- Provider quota, timeout, invalid-output, and failure mapping are covered by mocked tests. We did not intentionally break production credentials or exhaust quota.
- Browser microphone capture/review/save remains unverified. The user reported
  `ERR_INVALID_AUTH_CREDENTIALS` while opening the HTTPS app in the Codex in-app
  browser. This is a browser authentication entry failure; authenticated HTTP
  requests still pass. The browser tool blocked inspection of that error page
  under its URL policy. A normal-browser check or an approved login-page change
  is needed before calling browser access complete.
- Restart persistence passed after deployment `dep-db13kc0u01pc73cm26sg` became live. All three existing synthetic detail pages still loaded and all three stored embeddings were reused. First-thought abstention, health, authentication, invalid-payload handling, and cross-site rejection passed again after the restart. No new fixtures were created in this repeat check.
- Live deployment notes in DEPLOYMENT.md remain uncommitted because the commit approval was declined. This report contains no credentials.

## Complete automated test catalogue

The following names correspond to the 82 passing tests. Several tests cover multiple cases within a single named test.

The catalogue below records the original deployment checks. The approved login-page
update adds eight session tests (90 total), listed in the login update record at
the end. Its live verification supersedes the earlier unresolved Basic-prompt issue.

### connection-generation.test.ts (5)

- groups at most five candidates into one call and sends only structured fields
- preserves a model's no-connection decision and skips inference for empty candidates
- keeps thought instructions in data and explicitly permits abstaining
- rejects malformed provider envelopes, JSON, and inconsistent results
- maps unavailable model, provider failures, network failure, and timeouts to explicit errors

### connection-presentation.test.ts (1)

- connection presentation labels AI output, hides absent results and optional questions, and escapes text

### connection-route.test.ts (5)

- loads saved structured fields and returns one validated grouped analysis
- empty or deleted candidates return no connection without calling Gemma
- missing thoughts return 404 and unprepared memory returns 409 before inference
- keeps model abstention distinct from validation, provider, and database failures
- bounds record loading to five candidates and preserves retrieval order

### demo-access.test.ts (5)

- production fails closed without a usable password; development remains accessible by default
- validates username and password, rejects malformed credentials and does not disclose the password
- only exact health GET and HEAD bypass protection; routes and alternate representations require credentials
- rejects authenticated cross-site browser writes while allowing same-origin and CLI requests
- each sensitive API enforces the gate even when called without proxy

### embedding-persistence.test.ts (5)

- indexes stored text and binds vector, metadata and UUID as SQL parameters
- reuses compatible embeddings without calling Ollama or writing
- regenerates embeddings when model or recipe differs
- handles invalid IDs, missing thoughts and concurrent completion
- indexing failure cannot overwrite stored content or return provider details

### embeddings.test.ts (7)

- embeds exact input with independent model configuration and validates the response
- uses embedding defaults without changing the structuring model
- rejects empty or non-string input before calling Ollama
- rejects malformed response shapes and vectors
- handles unreadable JSON without exposing provider contents
- maps provider errors to safe messages without reading their bodies
- handles network failure and timeouts during fetch or response reading

### google-ai.test.ts (7)

- hosted route preserves transcript data, separates instructions and keeps the key out of the URL
- provider switch keeps default and explicit local inference; hosted model is independently configurable
- hosted connections retain abstention, five-candidate bound, and metadata projection
- invalid provider, missing key, and unsupported models fail before any request
- hosted errors map quotas, configuration, network, and timeout without fallback or leaking provider bodies
- rejects malformed, blocked, truncated, and schema-invalid model output
- reads text across parts, ignores thought parts, and accepts a complete fenced JSON object

### google-embeddings.test.ts (8)

- hosted embedding request preserves input, uses 768 dimensions and the API key header
- local provider remains default and keeps existing model metadata independently of Google reasoning
- rejects invalid configuration and input before requesting hosted embeddings
- validates hosted vector dimensions, finite numbers, magnitude, and envelope
- maps hosted quota, configuration, upstream, network and response-reading timeouts without fallback
- reindexing local vectors writes normalized Google vectors and metadata without changing transcript fields
- hosted retrieval rejects a local source and searches only matching Google metadata
- readiness CLI uses the shared hosted adapter and reports a missing key without database or inference calls

### memory-responses.test.ts (2)

- accepts valid memory confirmation, empty matches and card responses
- rejects unsafe IDs, invalid dates, malformed scores and accidental vector exposure

### persistence.test.ts (3)

- saves the exact raw transcript and retries without overwriting
- rejects invalid input and missing configuration
- rejects a reused ID with different content and hides database errors

### related-thoughts.test.ts (4)

- retrieval binds parameters, excludes incompatible/future thoughts and returns only public fields
- distinguishes empty matches, missing thought and unprepared memory
- rejects invalid IDs without querying and invalid thresholds without searching
- supports configured threshold and hides database errors

### structured-thought.test.ts (5)

- sends the exact transcript and JSON schema to Ollama
- rejects malformed requests before calling Ollama
- rejects schema-invalid and logically inconsistent model output
- handles invalid JSON, invalid provider shape, unavailable model, and timeout
- keeps instructions spoken in the transcript out of the system message

### thought-connection.test.ts (5)

- accepts connected and unconnected results with an optional or null question
- rejects contradictory connection flags without repairing the model output
- rejects missing required fields, wrong types, and unexpected fields
- rejects blank or oversized text and accepts exact length limits
- trims generated text before returning a validated result

### thought-detail.test.ts (2)

- invalid detail IDs are rejected without querying PostgreSQL
- missing thoughts return null while database failures propagate

### transcript-embeddings.test.ts (7)

- keeps short transcripts intact and respects the exact byte boundary
- covers every character with bounded chunks and overlap, including multilingual text
- embeds chunks sequentially with one task prefix and normalizes their mean
- normalizes a single chunk and skips meaningless whitespace chunks
- rejects empty and oversized input before any provider calls
- stops on a failed chunk instead of returning a partial transcript vector
- rejects cancellation to a zero mean instead of dividing by zero

### transcription.test.ts (11)

- sends the audio to ElevenLabs and preserves the exact transcript
- rejects non-multipart requests
- rejects missing, string, and empty audio fields
- rejects malformed multipart data
- rejects an unsupported file type
- rejects oversized audio even without Content-Length
- bounds the multipart body stream, not just its audio field
- missing API key returns a configuration error without calling the provider
- maps provider errors without exposing their bodies
- rejects missing, non-string, and empty transcript output
- handles invalid JSON, provider network failure, and timeout

## Login-page update — 4 October 2026

Revision: `666e289`. All 90 automated tests, ESLint, and production build pass.

The normal `/login` form replaces the browser Basic prompt. Correct credentials set an eight-hour signed, HttpOnly, Secure, SameSite=Strict cookie. Logout clears the cookie; password rotation invalidates existing sessions. Production still fails closed without usable configuration. APIs retain independent access checks; login and cookie-authenticated writes require same-origin requests.

The embedded browser successfully signed in and displayed the capture page, then signed out to the login page, including after the final `666e289` deployment. The capture notice now reflects hosted Google or local Ollama inference. Browser microphone capture remains a manual check.

Render deployment `dep-db14380u01pc73co3cj0` is live on revision `666e289`.
The deployed HTTPS verification passed for health, login/logout cookies,
protected-page redirects, authenticated pages and APIs, invalid credentials,
cross-site rejection, and cached-browser/CLI credential compatibility. Existing
synthetic detail pages and embeddings persisted and were reused; first-thought
abstention also passed. No new thoughts were created by these repeat checks.

During verification, Next URL normalization and Node fetch metadata exposed two compatibility issues. Both were corrected and regression tests added. The CLI correction was committed and pushed after the user approved the previously declined execution request.

Additional automated tests (8):

- signed sessions authenticate without exposing the password and expire after eight hours
- rejects forged, duplicate, malformed sessions and invalidates cookies when the password rotates
- production cookies are host-only, HttpOnly, Secure and Strict; local cookies permit HTTP development
- cached browser Basic credentials cannot bypass the login page or undo cookie logout
- login sets a signed session and logout clears it with uncached redirects
- invalid, missing, duplicate and oversized login inputs never set a cookie; missing configuration stays closed
- login and cookie-authenticated writes reject absent, invalid, insecure and cross-site origins
- login and static build assets are public while APIs and data representations stay guarded
