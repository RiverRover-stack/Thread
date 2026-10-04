# Thread

> A voice-first thought companion for ideas that arrive before the words are in order.

[Try the public demo](https://thread-e5b3.onrender.com/)

Thread helps someone capture an unfinished thought without stopping to write and organise it. A person speaks naturally, and the application preserves the transcript, creates a structured interpretation, and saves both to a timeline.

When a later thought is recorded, Thread retrieves relevant earlier thoughts and asks Gemma whether they reveal a useful relationship. It may suggest a connection, an implication, and a question worth exploring—or return no connection when the evidence is weak.

## What it does

- Records a short voice note in the browser.
- Transcribes the recording with ElevenLabs Scribe.
- Uses Gemma to create a title, summary, categories, possible action, and question.
- Keeps the original transcript separate from the AI interpretation.
- Saves thoughts in a chronological PostgreSQL timeline.
- Uses embeddings and pgvector to retrieve up to five relevant earlier thoughts.
- Uses Gemma to examine whether those thoughts form a useful connection.
- Supports local Gemma and EmbeddingGemma through Ollama, or hosted models for the public demo.
- Traces AI stages with optional, content-filtered Sentry instrumentation.

The model's suggestions are possibilities, not conclusions about what the person thinks. The original words remain available so the user can judge whether an interpretation is faithful and useful.

## How it works

```mermaid
flowchart TD
    A[Speak an unfinished thought] --> B[ElevenLabs Scribe]
    B --> C[Original transcript]
    C --> D[Gemma structures the thought]
    C --> E[Embedding model creates a vector]
    C --> F[(PostgreSQL)]
    D --> F
    E --> F
    F --> G[pgvector retrieves relevant earlier thoughts]
    D --> H[Current structured thought]
    G --> I[Gemma examines the relationship]
    H --> I
    I --> J[Connection, implication and question]
    I --> K[No connection when evidence is weak]
```

Similarity search and reasoning have separate responsibilities. pgvector selects earlier thoughts with related meaning. Gemma then decides whether any of them helps address, test, support, or challenge something in the current thought. A shared topic alone is not treated as a useful connection.

Thread sends at most five retrieved thoughts to connection analysis. It does not send the entire timeline, raw audio, database identifiers, or vectors to that reasoning step.

## Example

Several incomplete thoughts might be recorded at different moments:

> “I had an idea while walking, but stopping to write it properly felt like too much interruption.”

> “A bookmark saves the place in a podcast, but not why that moment mattered to me.”

> “Old photos return at the right time. Notes usually stay where we left them.”

A later thought about capturing ideas by voice and resurfacing related notes may give those earlier observations a possible direction. Thread brings the source thoughts back and clearly labels the generated relationship as AI interpretation.

These are demonstration thoughts, not user feedback or measured results.

## Local and hosted modes

The public demo and local setup use the same application flow with different reasoning, embedding, and database backends.

| Stage | Local setup | Public demo |
| --- | --- | --- |
| Voice transcription | ElevenLabs Scribe | ElevenLabs Scribe |
| Thought structuring | Gemma 3 4B through Ollama | Gemma 4 through Google AI Studio |
| Semantic embeddings | EmbeddingGemma through Ollama | Google `gemini-embedding-2` |
| Retrieval and storage | Local PostgreSQL with pgvector | Render PostgreSQL with pgvector |
| Connection analysis | Gemma through Ollama | Hosted Gemma |

ElevenLabs handles one recording at a time and does not receive the timeline or related thoughts. In local mode, reasoning, semantic retrieval, and durable thought storage run on the user's computer. The complete voice path is therefore not fully offline.

The public demo uses anonymous browser workspaces so visitors do not share timelines. It is intended for synthetic or non-sensitive demonstration content.

## Technology

| Component | Role |
| --- | --- |
| Next.js, React and TypeScript | Web application and server routes |
| ElevenLabs Scribe v2 | Speech-to-text |
| Gemma | Thought structuring and connection analysis |
| EmbeddingGemma / Google embeddings | Semantic representations of transcripts |
| PostgreSQL and pgvector | Persistent timeline and similarity search |
| Prisma | Database access and migrations |
| Zod | Runtime validation of requests and model output |
| Render | Public application and database hosting |
| Sentry | Optional AI-stage tracing with content filtering |

## Run locally

### Requirements

- Node.js 22.12+ on the 22.x line, or Node.js 24+
- PostgreSQL with the pgvector extension available
- [Ollama](https://ollama.com/) for local Gemma and EmbeddingGemma
- An ElevenLabs API key with speech-to-text access

### Setup

```bash
git clone https://github.com/RiverRover-stack/Thread.git
cd Thread
npm ci
cp .env.example .env.local
```

Create an empty PostgreSQL database, then add the required values to `.env.local`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/thread?schema=public
ELEVENLABS_API_KEY=your_server_side_key

AI_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_MODEL=gemma3:4b
OLLAMA_EMBEDDING_MODEL=embeddinggemma:300m
```

Download the local models and prepare the database:

```bash
ollama pull gemma3:4b
ollama pull embeddinggemma:300m
npm run db:migrate
npm run db:generate
```

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Secrets remain server-side. Do not commit `.env.local` or expose credentials through variables prefixed with `NEXT_PUBLIC_`.

## Validate the project

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The automated suite covers request validation, provider adapters, persistence, workspace isolation, embeddings, retrieval, connection analysis, usage controls, and observability boundaries. Semantic quality still requires reviewing real model outputs; a valid JSON response does not prove that a suggestion is useful.

## Project structure

```text
app/                  Pages and API routes
components/           Voice capture, timeline and thought views
lib/ai/               Gemma adapters, prompts and output contracts
lib/embeddings/       Local and hosted embedding adapters
lib/db/               PostgreSQL persistence and pgvector retrieval
lib/speech/           Audio transcription
lib/observability/    Privacy-filtered tracing
prisma/               Schema and versioned migrations
tests/                Automated behavior and boundary tests
```

## License

Licensed under the [Apache License 2.0](LICENSE).
