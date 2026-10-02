# Thread — Hackathon Project Specification

## Project Overview

Working name: Thread

Tagline:
"Don't interrupt a thought to save it."

Thread is a voice-first AI thought companion.

The problem:
People often get useful ideas while coding, studying, walking, working, or doing something else.

Capturing those ideas creates friction:
- open a notes app
- decide where to put the thought
- write it properly
- organize it
- interrupt the activity currently being performed
- potentially lose the thought while doing all of that

Thread should reduce that friction.

The user should be able to speak a messy thought in a few seconds and immediately return to what they were doing.

The system should then:
1. transcribe the voice,
2. preserve the original transcript,
3. understand and structure the thought,
4. classify it,
5. save it,
6. retrieve semantically related previous thoughts,
7. reason over the new thought and relevant previous thoughts,
8. surface a useful connection the user may not have noticed.

This is NOT intended to be another generic AI notes application.

The core product idea is:

"Continuity for human thinking."

---

# Hackathon Context

Theme:
Build for a Friend

The project should solve a real problem for one real person.

The application should be handed to the intended user and their genuine feedback should be included in the submission if possible.

The hackathon requires open-source or open-weight AI to be at the core of the project.

Gemma should remain the primary reasoning model.

Potential partner integrations:
- Gemma: core AI reasoning
- ElevenLabs: voice transcription
- Render: deployment
- Backboard: optional memory/RAG integration if useful
- Sentry Agent Tracing: optional observability after MVP completion

Partner integrations should only be added when they genuinely improve the product.

Do not add technologies purely to qualify for additional categories.

---

# Why Open AI Matters

Thoughts can contain highly sensitive or personal information:

- unfinished ideas
- research concepts
- startup ideas
- private reflections
- work information
- personal plans

A thought companion should not inherently require sending every unfinished thought to a closed external system.

Open-weight AI creates the possibility of:

- local inference
- user-controlled models
- model swapping
- privacy
- reduced vendor lock-in
- lower long-term inference cost
- customization

The initial hackathon implementation may still use hosted inference if necessary for speed of development.

However, the architecture should not tightly couple the application to one closed provider.

Gemma is the primary open-weight reasoning model.

---

# Core User Flow

User is doing something
        ↓
has an idea
        ↓
presses microphone
        ↓
speaks naturally for 5–30 seconds
        ↓
stops recording
        ↓
returns to their work
        ↓
Thread processes the thought
        ↓
thought is saved
        ↓
related old thoughts are found
        ↓
AI surfaces a possible connection

Example raw input:

"Maybe instead of only showing parameter reduction for my compressed model, I should benchmark the latency on Raspberry Pi because the smaller model may not necessarily be faster."

Expected structured output:

{
  "title": "Benchmark compressed model on edge hardware",
  "summary": "Compare model compression techniques using real inference latency in addition to parameter count.",
  "categories": ["project", "edge-ai"],
  "actionable": true,
  "possibleAction": "Benchmark teacher, distilled and quantized models on Raspberry Pi.",
  "questionToExplore": "Does the smallest model actually achieve the lowest real-world inference latency?"
}

The raw transcript must always be preserved separately.

---

# Product Screens

## 1. Capture Screen

Purpose:
Save a thought with minimum friction.

UI should contain:
- prominent microphone control
- recording indicator
- transcript preview if useful
- processing state
- success confirmation

The user should NOT need to:
- select folders
- assign manual tags
- write a title
- format the thought
- organize it manually

The AI handles organization afterward.

---

## 2. Thought Timeline

Purpose:
Answer:

"What have I been thinking about?"

Display thoughts chronologically.

Each thought card should show approximately:
- AI-generated title
- timestamp
- short summary if useful
- category
- indicator when related thoughts or connections exist

The timeline should be easy to scan.

The messy transcript should not be the primary timeline representation.

---

## 3. Thought Detail Page

Purpose:
Answer:

"What did I mean, and what can I do with this thought?"

Show:

- title
- original transcript
- AI interpretation / summary
- categories
- possible action
- question to explore
- created time

Important design principle:

Clearly separate:

USER SAID

from

AI INTERPRETED

The user must always be able to distinguish their original thought from AI-generated interpretation.

---

## 4. Related Thoughts

Inside the thought detail page, show semantically related previous thoughts.

Each related thought may show:
- title
- date
- short summary
- similarity or relevance indicator if useful

The goal is to answer:

"Have I thought about something connected to this before?"

---

# Killer Feature

The main differentiating feature is:

"You Were Onto Something"

Example:

Previous thought:

"My portfolio needs stronger evidence that knowledge distillation improves deployment."

Current thought:

"I should benchmark the compressed model on Raspberry Pi."

Possible AI connection:

"These two ideas suggest evaluating compression using real deployment metrics such as latency, memory usage, and energy consumption rather than reporting parameter count alone."

This feature is more important than adding many secondary features.

The model should not force connections.

If no genuinely useful connection exists, the application should say nothing rather than fabricate one.

---

# Recommended Architecture

User speaks
     ↓
Speech-to-text
     ↓
Raw transcript
     ↓
Gemma
     ↓
Structured thought
     ↓
Store thought
     ↓
Generate embedding
     ↓
Retrieve related thoughts
     ↓
Gemma
     ↓
Possible connection / new insight
     ↓
UI

The architecture should remain simple.

Do not introduce a multi-agent system unless there is a clear technical need.

---

# Tech Stack Decisions

## Frontend

Use:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- browser MediaRecorder API for microphone capture

Use shadcn/ui only if useful.

Do not spend large amounts of time installing or customizing component libraries unnecessarily.

---

## Backend

Use Next.js route handlers / server-side functions initially.

Do NOT create a separate backend service unless a real technical requirement appears.

Reason:

This is a short hackathon and fewer moving parts are preferable.

---

## Database

Preferred:
PostgreSQL

Use Prisma ORM if it keeps development fast and clear.

Possible development setup:
- local Postgres
- hosted Postgres-compatible database for deployment

If PostgreSQL setup blocks early development significantly, SQLite can temporarily be used during Phase 1.

The persistence layer should make migration reasonably easy.

---

# Core Thought Data Model

Thought:

{
  id: string
  rawTranscript: string
  title: string
  summary: string
  categories: string[]
  actionable: boolean
  possibleAction?: string
  questionToExplore?: string
  createdAt: Date
}

Later:

{
  embedding?: number[]
}

Potential later relation model:

ThoughtConnection:

{
  id: string
  sourceThoughtId: string
  relatedThoughtId: string
  connectionText: string
  similarityScore?: number
}

Do not create ThoughtConnection infrastructure until semantic retrieval is actually implemented.

---

# AI Reasoning

Gemma is the primary reasoning model.

Do not tightly couple the app to one API provider.

Create a small AI abstraction, for example:

lib/ai/
  index.ts
  schemas.ts
  gemma.ts

Functions may include:

generateStructuredThought(...)
generateConnection(...)

The rest of the application should call these abstractions rather than directly calling the provider everywhere.

---

# Structured AI Output

Use Zod to validate model output.

Expected structure:

{
  title: string,
  summary: string,
  categories: string[],
  actionable: boolean,
  possibleAction: string | null,
  questionToExplore: string | null
}

Model instructions should emphasize:

- preserve the user's intended meaning
- do not invent factual claims
- keep title concise
- make the summary understandable
- use reusable categories
- only create an action when appropriate
- questions should help continue thinking
- avoid generic advice

Never assume raw model output is valid JSON.

Validate it.

Handle invalid output gracefully.

---

# Speech Layer

Preferred transcription provider:

ElevenLabs

Reason:
Voice is a fundamental part of the product experience.

However, keep transcription behind a small abstraction.

Example:

transcribeAudio(audio): Promise<string>

This should make it possible to switch later between:

- ElevenLabs
- local Whisper
- another open speech model

Do not tightly couple the application to ElevenLabs.

---

# Embeddings

Embeddings are NOT part of Phase 1.

After the basic capture flow works, introduce an abstraction such as:

embedText(text): Promise<number[]>

Prefer an open embedding model if practical.

A small sentence-transformer-compatible model is acceptable.

Do not spend excessive time optimizing embeddings during the hackathon.

---

# Vector Retrieval

Preferred if easy:

PostgreSQL + pgvector

If pgvector setup becomes a time sink, use a simpler retrieval implementation temporarily.

The hackathon goal is to demonstrate meaningful semantic retrieval, not infrastructure complexity.

---

# Semantic Retrieval Flow

Current thought
     ↓
embedding
     ↓
vector similarity search
     ↓
top relevant previous thoughts
     ↓
send selected thoughts to Gemma
     ↓
generate possible connection

Do not send the user's entire history to Gemma.

Retrieve only a small number of relevant thoughts.

---

# Connection Generation

Input:

currentThought
relatedThoughts[]

Prompt Gemma to:

1. determine whether a genuinely useful connection exists,
2. avoid forcing a connection,
3. briefly explain the connection,
4. identify a useful implication,
5. optionally suggest one question worth exploring.

Example instruction:

"Identify whether there is a genuinely useful connection between the current thought and these previous thoughts.

Do not force a connection.

If one exists:
- explain it briefly,
- identify the useful implication,
- optionally suggest one question worth exploring.

If there is no meaningful connection, return no connection."

---

# Important Architectural Principles

## 1. Preserve Source Truth

Never overwrite the original transcript.

Maintain:

USER SAID:
raw transcript

AI INTERPRETED:
summary / categories / action / question

---

## 2. Validate Model Outputs

All structured model output should be validated.

Do not trust model-generated JSON automatically.

---

## 3. Avoid Unnecessary Agent Frameworks

Do NOT introduce:

- LangChain
- LangGraph
- CrewAI
- AutoGen
- other agent frameworks

unless a concrete requirement appears.

Simple functions are preferable.

---

## 4. Avoid Microservices

Use one application first.

Do not create multiple services without a clear reason.

---

## 5. Avoid Premature Authentication

The MVP may be single-user.

Authentication can come later.

---

## 6. Avoid Premature Synchronization

Do not build multi-device syncing during the initial MVP.

---

## 7. Avoid a Complex Knowledge Graph

Embeddings and semantic retrieval are enough.

---

## 8. Avoid Feature Creep

Do NOT build during the hackathon unless explicitly requested later:

- Gmail integration
- calendar integration
- browser extension
- native mobile app
- collaboration
- social features
- task manager
- reminders system
- complex knowledge graph
- fine-tuning
- multi-agent orchestration

---

# Suggested Project Structure

Use approximately:

app/
  page.tsx

  thoughts/
    page.tsx

    [id]/
      page.tsx

  api/
    transcribe/
      route.ts

    thoughts/
      route.ts

    process/
      route.ts

components/
  capture/
    VoiceRecorder.tsx
    RecordingIndicator.tsx

  thoughts/
    ThoughtCard.tsx
    ThoughtTimeline.tsx
    ThoughtDetail.tsx
    RelatedThoughts.tsx

lib/
  ai/
    index.ts
    schemas.ts
    gemma.ts

  speech/
    index.ts
    elevenlabs.ts

  db/
    ...

  embeddings/
    index.ts

  retrieval/
    ...

types/
  ...

Do not create empty abstractions simply because they look architecturally neat.

Only create structures that support implemented functionality.

---

# Performance Philosophy

Capturing a thought should feel faster than opening and writing in a normal notes application.

Eventually measure:

- recording duration
- transcription latency
- structured extraction latency
- embedding latency
- retrieval latency
- connection generation latency
- total processing time

The user does not necessarily need to wait for every AI step.

A good future UX:

record
   ↓
transcript obtained
   ↓
thought saved
   ↓
user can leave
   ↓
AI enrichment continues
   ↓
connections appear afterward

Prefer responsiveness over blocking the UI.

---

# Deployment

Target Render if practical.

Possible deployment structure:

- Next.js application on Render
- hosted PostgreSQL database
- API credentials stored as environment variables

Do not work on deployment before the local MVP works.

---

# Observability

Sentry Agent Tracing is optional.

Only add it after the core product works.

Useful future traces:

capture thought
   ↓
transcription
   ↓
structured extraction
   ↓
embedding
   ↓
retrieval
   ↓
connection generation

Possible metrics:

- latency per step
- failures
- token usage
- AI processing duration
- total capture processing time

Observability should support the product story:

"If thought capture feels slow, people will stop using it."

---

# Optional Backboard Integration

Backboard may be considered only after the MVP is stable.

Possible role:

- assistant memory
- RAG
- retrieval over previous thoughts

Only use it if it simplifies the architecture or meaningfully improves memory.

Do not replace a working retrieval system simply to add another partner integration.

---

# Development Phases

## Phase 1 — Core Capture Loop

Goal:

VOICE
→ TRANSCRIPT
→ GEMMA
→ STRUCTURED THOUGHT
→ SAVE
→ TIMELINE
→ THOUGHT DETAIL

Build:

- microphone recording
- transcription
- raw transcript preservation
- structured thought extraction
- database persistence
- timeline
- thought detail page

Do NOT implement yet:

- embeddings
- related thoughts
- semantic search
- Backboard
- Sentry
- authentication
- complex animations

Definition of done:

I can:

1. open the app,
2. press record,
3. speak a messy thought,
4. stop recording,
5. receive a transcript,
6. have Gemma structure it,
7. save the thought,
8. see it in the timeline,
9. open it,
10. see both the raw transcript and AI interpretation.

---

# Phase 2 — Semantic Memory

Implement:

- embeddings
- vector storage
- semantic search
- retrieval of related thoughts

Definition of done:

When I open a thought, I can see previous thoughts that are semantically related.

---

# Phase 3 — "You Were Onto Something"

Use Gemma to reason over:

- the current thought
- a small number of retrieved related thoughts

Generate:

- useful connection
- implication
- optional question to explore

Do not manufacture connections.

---

# Phase 4 — UX Polish

Improve:

- recording feedback
- loading states
- empty states
- timeline readability
- thought detail layout
- related thought cards
- responsive design
- error handling

No major architecture changes.

---

# Phase 5 — Deployment and Optional Partner Integrations

After the product is stable:

- deploy to Render
- add Sentry if useful
- consider Backboard
- improve tracing
- prepare screenshots and demo

---

# Hackathon Submission Story

The submission should focus on:

1. the real human problem,
2. the real friend,
3. why capturing thoughts is harder than it seems,
4. how Thread reduces friction,
5. why voice is central,
6. how Gemma structures and connects thoughts,
7. why open-weight AI matters,
8. how related thoughts are retrieved,
9. the "You Were Onto Something" feature,
10. what the friend said after using it.

Avoid presenting the project as a stack of technologies.

Lead with the human problem.

---

# Development Rules for Codex

When working on this repository:

1. inspect existing code before making large changes,
2. reuse working code when possible,
3. explain important architectural decisions,
4. do not install unnecessary dependencies,
5. do not silently mock AI functionality,
6. keep TypeScript types strong,
7. validate external API responses,
8. handle failures clearly,
9. avoid overengineering,
10. work phase by phase.

After each meaningful implementation phase:

- run lint
- run type checking
- run build
- fix errors
- summarize changes
- explain how to run the application
- provide a manual test checklist

If API credentials are missing:

- implement the integration cleanly,
- document the required environment variable,
- do not invent credentials,
- do not pretend the integration was tested if it was not.

---

# Current Priority

Do not work on the entire roadmap at once.

The immediate goal is only:

VOICE
→ TRANSCRIPT
→ GEMMA STRUCTURED THOUGHT
→ SAVE
→ TIMELINE
→ THOUGHT DETAIL

Everything else comes afterward.