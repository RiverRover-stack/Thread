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

Live ingestion, deployed trace inspection and submission screenshots belong to
milestone 2. They remain pending until a Sentry project is connected and deployed.

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
