# Thread

Don't interrupt a thought to save it.

## Current scope

Phase 1, Milestone 1: the Next.js homepage captures microphone audio with the
browser MediaRecorder API and provides local playback. TypeScript, Tailwind CSS,
and Prisma's PostgreSQL configuration are in place. Transcription, AI interpretation,
persistence, timeline, and detail pages are not implemented yet.
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
- `components/capture/VoiceRecorder.tsx`: microphone permission, recording lifecycle,
  audio Blob, local playback, errors, and resource cleanup.
- `prisma/schema.prisma`: database provider and future data models.
- `prisma.config.ts`: Prisma CLI configuration and environment loading.
- `scripts/check-db.mjs`: read-only PostgreSQL connectivity diagnostic.
- `.env.example`: required variable names without secrets.

Current capture flow: microphone → MediaStream → MediaRecorder chunks → Blob →
local object URL → audio playback. Audio stays in memory in the browser tab;
refreshing or leaving the page loses the recording. Recording again replaces it.
The Blob is retained in the component's `recording.blob` for the next milestone.
The database check is a separate CLI flow: `.env.local` → PostgreSQL → `SELECT 1`.

## Verify voice capture (Milestone 1)

1. Run `npm run dev` and open http://localhost:3000. Remote access requires HTTPS
   for microphone permission; an ordinary HTTP LAN address will not work.
2. Press **Record a thought** and allow microphone access. Say a short sentence.
3. Press **Stop recording**. Confirm the browser's active microphone indicator stops.
4. Play the audio and confirm your sentence is audible. Expand **Recording details**
   and confirm a nonzero Blob byte count and an audio MIME type.
5. Press **Record again**, capture a different sentence, and confirm playback is
   replaced with the new clip. Refresh and confirm the preview disappears.
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
local credentials. Provider configuration will be introduced with the integration
milestones: ElevenLabs in Milestone 2 and a chosen Gemma host in Milestone 3.
