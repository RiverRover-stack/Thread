# Thread AI tracing

Milestone 1 adds optional server-side Sentry tracing. It does not change the
AI providers, retrieval rules, database or public API contracts.

## Enable

Create a Sentry project and put its DSN in `SENTRY_DSN` on the server.
Use `SENTRY_TRACES_SAMPLE_RATE=1` for synthetic verification, then lower the rate
for normal traffic (default `0.1`). Restart or redeploy after changing variables.
Leave the DSN blank to disable monitoring. Do not put credentials in source code.
There is no browser SDK or session replay. Source-map upload is not configured.

## Data flow and ownership

`instrumentation.ts` loads `sentry.server.config.ts` in the Node runtime.
The config initializes the SDK and applies the export filters in
`lib/observability/privacy.ts`. `lib/observability/trace.ts` wraps existing
operations, preserving their outputs and original errors.

Instrumented entry points:

- `lib/speech/index.ts`: ElevenLabs transcription.
- `lib/ai/index.ts`: Gemma structuring and connection inference.
- `lib/embeddings/index.ts`: one embedding call per transcript chunk.
- `lib/embeddings/index-thought.ts`: indexing, including the reuse path.
- `lib/db/thoughts.ts`: retrieval using the existing pgvector query.
- `lib/ai/thought-connection.ts`: parent workflow containing retrieval and inference.

Each span measures an operation, with nested spans exposing which step takes
time. The connection workflow is a fixed pipeline; tracing does not introduce an
autonomous agent. Separate browser requests produce separate traces; this milestone
does not measure one continuous recording-to-save journey.

## Recorded metadata

Stage, outcome, provider, approved model name, candidate count, error status and
duration. Google Gemma usage records input tokens and output tokens including
reported thinking tokens. Ollama usage records its reported evaluation counts.
Missing or invalid counts are omitted. Google embeddings and ElevenLabs do not
currently supply token counts through these adapters. No estimated costs are sent.

Automatic integrations are disabled. Span and error export allowlists exclude
audio, transcript, titles, summaries, prompts, generated text, vectors, record IDs,
SQL, URLs, cookies, headers, arbitrary error messages, breadcrumbs and user data.
Only generic stage failure messages are exported. This intentionally trades detailed
remote error diagnostics for privacy; debug the corresponding application code locally.

## Validation

`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

After building, run `node scripts/verify-observability.mjs` for a runtime check.
It starts a temporary production Next server, a mock Ollama endpoint and a local
HTTP telemetry receiver. It verifies authenticated structuring, token metadata,
privacy, model failure events and a receiver returning HTTP 503. It shuts down
its temporary servers and does not use real AI credentials or a database.

`tests/observability.test.ts` exercises the actual SDK with an in-memory transport:
unconfigured operation, nested spans, metadata filters, provider usage, original
error propagation and a simulated delivery outage. No Sentry account or real AI
credentials are needed for these tests.

## Milestone 2: hosted verification

On October 4, 2026, the `thread` Next.js project was created in the Sentry
organization `kaustubh-ye`. Its DSN was added to Render without replacing existing
environment variables. Commit `1f9c875` deployed with monitoring enabled
(`dep-db16jnad0e5s73ebso30`). Full sampling was used for synthetic verification;
normal sampling was then restored to `0.1`.

All 9 production HTTP checks passed at 15:02 UTC: health, ElevenLabs transcription,
hosted Gemma structuring, persistence, the expected HTTP 409 before indexing,
Google embedding/indexing, vector reuse, pgvector retrieval, and connection
analysis. Retrieval found three earlier candidates; Gemma returned
`hasConnection: false`, a valid abstention. One synthetic thought was added for
this run. Statuses and full HTTP timings are in
`plugin-artifacts/sentry-production-results.json`.

Sentry's trace explorer received all seven stage types (10 stage spans including
repeated indexing/retrieval). The measurements below are actual exported spans,
not the full HTTP timings:

| Operation | Duration |
| --- | ---: |
| ElevenLabs transcription | 1.40 s |
| Gemma structuring | 2.18 s |
| Google embedding | 254.14 ms |
| First indexing, including embedding | 264.32 ms |
| Reused indexing | 2.34 ms |
| Connection workflow | 958.17 ms |
| Retrieval within the workflow | 25.01 ms |
| Gemma connection inference | 917.63 ms |

The connection inference reported **949 input + 21 output = 970 tokens** for
`gemma-4-26b-a4b-it`. Its Input and Output tabs showed no content, confirming
the intended content exclusion in this inspected span. The SDK privacy tests
cover the wider export allowlist. Sentry displayed a cost estimate of `<$0.01`;
Thread does not report costs, and this dashboard estimate is not a Google bill
or proof of free-tier usage.

### Findings for the submission

- Gemma inference consumed about 96% of the connection workflow in this run;
  vector retrieval consumed about 3%. Model latency is the first place to
  investigate for this workflow. This single sample does not establish p95 or
  comparative model performance.
- Reusing an existing vector avoided another embedding call: the index span
  fell from 264.32 ms to 2.34 ms. Full HTTP latency remained around 290 ms, so
  internal span time and user-perceived request time must be distinguished.
- The deliberately requested pre-index retrieval returned HTTP 409 and created
  `THREAD-1`, titled `Thread retrieve failed`. This is an expected guard, not an
  outage; the current instrumentation groups any thrown retrieval failure as
  an error. That distinction matters when interpreting alerts.
- Next.js also exports enclosing spans through its framework instrumentation.
  They are sanitized to `Thread request` with other attributes removed, which
  preserves hierarchy but reduces diagnostic detail. Filter `has:thread.stage`
  to inspect Thread's seven named operations.

Evidence (requires your Sentry sign-in):

- [Connection workflow and token counts](https://kaustubh-ye.sentry.io/explore/traces/trace/4d58a52d8ae044e681ece5aec37cfe04/?project=4512198546751568&node=span-89659a27ee63638c&tab=ai-spans)
- [Expected retrieval guard issue](https://kaustubh-ye.sentry.io/issues/151259104/?project=4512198546751568)
- Local screenshots: `plugin-artifacts/sentry-stage-spans.png`,
  `sentry-connection-trace.png`, `sentry-agent-activity.png`, and
  `sentry-guard-issue.png` in that directory.

For a short manual check, process a synthetic thought in the deployed app, then
open Sentry Traces with `has:thread.stage`. With normal 10% sampling, a particular
request may not appear. For a deliberate verification session, temporarily use
sample rate `1` and redeploy, then restore `0.1` afterward.

Milestone 1 validation (October 4, 2026): all 99 tests passed, including 9
observability tests; lint, TypeScript and production build passed. The privacy
regression test covers enclosing framework span names in both span payloads and
sampling metadata. Dependency audit reported 9 high advisories in the existing
Prisma/ESLint chain, with none naming Sentry; no existing package versions changed.

Runtime verification (October 4, 2026): all three HTTP scenarios passed using
the compiled production build. Nine SDK observability tests were rerun and passed.
The local environment files had no Sentry DSN; these results establish local
HTTP export, not ingestion into a hosted Sentry project.

If traces are absent, check DSN, sample rate, server restart, and the Sentry project
time range/environment first. A blank DSN disables initialization; a sampling
rate of zero disables traces. Monitoring delivery does not delay the response or
retry an AI call. In standalone scripts initialize Sentry explicitly; Next's
instrumentation startup hook only runs in the Next server.
