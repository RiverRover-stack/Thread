# Thread deployment — Phase 5

Milestone 1 prepares deployment configuration. Nothing has been provisioned or
published. Milestones 2–4 connect dependencies, deploy and verify, then prepare
the demo. Stop for verification after each milestone.

## Decisions before publishing

- Inference hosting: current adapters use Ollama's `/api/chat` and `/api/embed`.
  `127.0.0.1` on Render refers to Render's instance, not your Windows PC.
  Choose a reachable, appropriately protected inference host or approve a hosted
  provider adapter. Current code has no inference authentication header support.
  Do not expose your local Ollama server publicly to make this work.
- Access: there is one shared timeline with no user authentication. Anyone with
  access can read thoughts and invoke billable transcription. Agree on restricted
  access before using personal thoughts. Synthetic examples are suitable for a demo.
- Database and budget: choose PostgreSQL with pgvector and the service region.
  The template defines a free web service and provisions no database or model host.
  Check current limits before deciding whether this is adequate for the demo.

Sentry and Backboard remain optional. Existing PostgreSQL retrieval stays in place.

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `render.yaml` | Web runtime, commands, health path, and environment variable names |
| `app/api/health/route.ts` | Uncached HTTP liveness response with no dependency calls |
| `.env.example` | Local settings and production configuration guidance, without secrets |
| `package.json` | Existing build, start, migration, and verification commands |
| `prisma/migrations/` | Committed schema changes, including enabling pgvector |
| `lib/ai/ollama.ts` | Gemma structuring and connection requests |
| `lib/embeddings/ollama.ts` | EmbeddingGemma requests |

## Runtime configuration

Set values in Render's service environment. Never commit `.env.local` or add
database/provider secrets with a `NEXT_PUBLIC_` prefix.

| Setting | Production value |
| --- | --- |
| `NODE_VERSION` | `22.13.0`, matching the locally verified runtime |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Production PostgreSQL connection URL; use Render's internal URL when colocated |
| `ELEVENLABS_API_KEY` | Server-side key with speech-to-text access |
| `OLLAMA_BASE_URL` | Reachable Ollama-compatible API base URL; decision pending |
| `OLLAMA_MODEL` | `gemma3:4b`, installed on the chosen inference host |
| `OLLAMA_EMBEDDING_MODEL` | `embeddinggemma:300m`, installed on that host |
| `RELATED_THOUGHTS_MIN_SIMILARITY` | `0.70`, matching the existing retrieval threshold |

Keep the embedding model and recipe consistent with stored vectors. A different
embedding model is a semantic-memory change requiring evaluation and reindexing,
even if it also produces 768 numbers.

Render supplies `PORT`; Next.js uses it and the start command binds to `0.0.0.0`.
Do not hardcode a production port. `sync: false` prompts for values on initial
Blueprint creation; later secret changes must be made in the service environment.
Automatic redeploys are disabled. Creating a Blueprint still starts an initial
deploy, so wait until the decisions above are resolved before creating it.

## Build, migration, and startup

The template uses:

```text
Build: npm ci --include=dev && npm run build
Start: npm run db:migrate && npm start -- --hostname 0.0.0.0
Health check: /api/health
```

The build generates Prisma's client and compiles Next.js. It installs development
dependencies because TypeScript and the Prisma CLI are needed to build and migrate.
It does not apply migrations or intentionally call inference providers.

On the free web-service template, committed migrations run at startup; `&&` starts
Next.js only if migration succeeds. This adds startup time on restarts. Keep one
instance for this template. For a paid service, move `npm run db:migrate` to
`preDeployCommand` and use `npm start -- --hostname 0.0.0.0` as `startCommand`.
Do not run migrations both ways. Render's separate pre-deploy hook requires paid
compute. See [deploy commands](https://render.com/docs/deploys).

Use `prisma migrate deploy` through `npm run db:migrate`, never `migrate reset` or
`db push` against production. The embedding migration enables `vector` and creates
`vector(768)` storage. The database must support pgvector and the migration account
must be allowed to enable it. Back up an existing database before migrating.
Migrations create schema; they do not copy local thoughts into production.

## Verification

First verify locally:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm start -- --hostname 127.0.0.1 --port 3100
```

In another terminal:

```powershell
$healthResponse = Invoke-WebRequest http://127.0.0.1:3100/api/health
$healthResponse.StatusCode
$healthResponse.Content
$healthResponse.Headers['Cache-Control']
```

Expect `200`, `{"status":"ok"}`, and `no-store`. Stop the test server with Ctrl+C.
The endpoint only proves Next.js can answer HTTP requests. A successful probe does
not establish database, transcription, or model readiness. It reveals no secrets
and does not execute expensive inference on every platform health check.

Once dependencies are agreed and configured, Milestone 2 will apply migrations
and run `db:check` and `memory:check` against the intended database and model host.
These CLI scripts load `.env.local`, so confirm the target before running them;
local success does not validate a Render service's configuration.

Milestone 3 must verify the deployed HTTPS capture flow, saved data after restart,
related-thought links, model abstention, and provider failure/retry behavior. Use
synthetic thoughts until restricted access is in place. No live verification is
claimed by Milestone 1.

## Debugging and recovery

- Build failure: inspect Render's build log, Node version, and dependency install.
- Startup failure: inspect migration output first, then database connectivity,
  pgvector support and permissions. Never reset the database to unblock deployment.
- Health failure: inspect process startup and port binding. A database error on the
  timeline is a separate failure from this liveness check.
- Inference failure: inspect the affected route's HTTP status, configured host,
  installed model, and provider reachability. Local Ollama instructions in current
  error messages are another item to review when production hosting is chosen.
- Bad application deploy: redeploy the previous known-good application revision.
  This does not undo applied database migrations; review compatibility first.

## Your practice exercise

In `app/api/health/route.ts`, the `CHALLENGE` and `TODO(you)` comments describe adding
one fixed `service` property to the response. This practices editing an existing
TypeScript object. Follow the two hints there and repeat the health request to
verify both fields. The endpoint works before you attempt the exercise.

## Milestone 1 validation record

Verified locally on 4 October 2026 with Node.js 22.13.0: all 62 tests, ESLint,
TypeScript (`tsc --noEmit`), and the production build pass. Two HTTP requests to
the running production server's `/api/health` returned the expected JSON, status
200 and `Cache-Control: no-store`. The test server was stopped afterward.
The Blueprint parses as YAML; Render's server-side Blueprint validation and a
clean Render build remain unverified. No production migrations were applied.

## References

- [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app)
- [Blueprint fields and secret settings](https://render.com/docs/blueprint-spec)
- [Node version selection](https://render.com/docs/node-version)
- [HTTP health checks](https://render.com/docs/health-checks)
- [PostgreSQL extensions](https://render.com/docs/postgresql-extensions)
