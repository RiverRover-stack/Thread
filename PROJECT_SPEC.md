# Thread — Project Specification

## 1. Product

**Working name:** Thread  
**Tagline:** "Don't interrupt a thought to save it."

Thread is a voice-first AI thought companion.

### Problem

Useful thoughts often appear while the user is coding, studying, walking, working, or doing something else. Capturing them manually creates friction because the user must stop, open a notes app, write and organize the thought, and may lose it in the process.

### Core idea

Thread lets the user speak a messy thought in a few seconds and return to what they were doing. The system then preserves, structures, stores, and eventually connects those thoughts.

This is not a generic AI note-taking app. Its purpose is **continuity for human thinking**.

---

## 2. Core User Flow

### Current product direction

User is doing something
→ has an idea
→ presses microphone
→ speaks naturally for 5–30 seconds
→ stops recording
→ returns to their work
→ Thread processes the thought
→ thought is saved

### Later intelligence

Saved thoughts
→ semantic retrieval of related thoughts
→ Gemma reasons over the current and related thoughts
→ possible connection / new insight

---

## 3. Hackathon Fit

### Theme

**Build for a Friend**

The project should solve a real problem for one real person. The finished application should be given to the intended user and, if possible, their genuine feedback should be included in the submission.

### Open AI requirement

Open-source/open-weight AI must be central to the project.

Gemma is the primary open-weight reasoning model.

Open AI matters here because thoughts can contain:
- unfinished ideas
- research concepts
- startup ideas
- private reflections
- work information
- personal plans

Open-weight AI can support:
- local inference
- privacy
- user-controlled models
- model swapping
- reduced vendor lock-in
- lower long-term inference cost
- customization

Hosted inference may be used during the hackathon for speed, but the architecture should not be tightly coupled to one closed provider.

### Partner technologies

Potential integrations:
- **Gemma:** core AI reasoning
- **ElevenLabs:** voice transcription
- **Render:** deployment
- **Backboard:** optional memory/RAG after the MVP is stable
- **Sentry Agent Tracing:** optional observability after the core product works

Use partner technologies only when they genuinely improve the product.

Do not add technologies purely to qualify for categories.

---

## 4. Product Screens

### Capture

Purpose: save a thought with minimum friction.

The UI should provide:
- prominent microphone control
- recording state
- transcript preview if useful
- processing state
- success confirmation

The user should not need to select folders, manually tag, write a title, format, or organize the thought.

### Thought Timeline

Purpose: answer **"What have I been thinking about?"**

Display thoughts chronologically.

Each thought should show approximately:
- AI-generated title
- timestamp
- short summary if useful
- category
- indication of related thoughts/connections when available

### Thought Detail

Purpose: answer **"What did I mean, and what can I do with this thought?"**

Show:
- title
- original transcript
- AI interpretation / summary
- categories
- possible action
- question to explore
- created time

Clearly distinguish:

**USER SAID**
from
**AI INTERPRETED**

The raw transcript must remain available.

### Related Thoughts

Later, inside thought detail, show semantically related previous thoughts with:
- title
- date
- short summary
- similarity/relevance indicator if useful

---

## 5. Differentiating Feature

### "You Were Onto Something"

Thread should eventually compare the current thought with useful previous thoughts and surface a meaningful connection.

Example:

**Previous thought:**  
"My portfolio needs stronger evidence that knowledge distillation improves deployment."

**Current thought:**  
"I should benchmark the compressed model on Raspberry Pi."

**Possible connection:**  
"These two ideas suggest evaluating compression using real deployment metrics such as latency, memory usage, and energy consumption rather than reporting parameter count alone."

Do not force connections. If there is no genuinely useful connection, return no connection rather than inventing one.

---

## 6. Architecture

### Current architecture

User speaks
→ Speech-to-text
→ Raw transcript
→ Gemma
→ Structured thought
→ Store thought
→ UI

### Later architecture

Current thought
→ generate embedding
→ vector similarity search
→ retrieve a small set of relevant previous thoughts
→ Gemma
→ possible connection / new insight
→ UI

Keep the architecture simple.

Do not introduce a multi-agent system unless there is a clear technical need.

Do not send the user's entire thought history to Gemma; retrieve only relevant context.

---

## 7. Tech Stack

### Frontend
- Next.js
- TypeScript
- App Router
- Tailwind CSS
- browser MediaRecorder API

Use shadcn/ui only if useful. Do not spend significant time installing or customizing component libraries unnecessarily.

### Backend
- Next.js route handlers / server-side functions
- no separate backend service unless a real technical requirement appears

### Database
- PostgreSQL
- Prisma ORM

Local PostgreSQL is preferred during development; hosted PostgreSQL-compatible storage can be used for deployment.

SQLite may be used temporarily during Phase 1 only if PostgreSQL setup blocks early development. The persistence layer should remain easy to migrate.

### Speech
Preferred provider:
- ElevenLabs speech-to-text

Keep transcription behind a small abstraction such as:

`transcribeAudio(audio): Promise<string>`

This should allow a later switch to local Whisper or another speech model.

### AI
- Gemma as the primary reasoning model
- Zod for structured-output validation

Keep AI calls behind a small abstraction so the application is not tightly coupled to one provider.

### Embeddings
Not part of Phase 1.

Later, introduce:

`embedText(text): Promise<number[]>`

Prefer an open embedding model where practical.

### Vector storage
Preferred:
- PostgreSQL + pgvector

If pgvector becomes a time sink, use a simpler temporary retrieval implementation.

### Deployment
- Render

Do not work on deployment before the local MVP works.

### Observability
- Sentry Agent Tracing is optional
- add only after the core product works

### Memory/RAG
- Backboard is optional
- consider only after the MVP is stable

---

## 8. Data Model

### Thought

```text
id: string
rawTranscript: string
title: string
summary: string
categories: string[]
actionable: boolean
possibleAction?: string
questionToExplore?: string
createdAt: Date
```

Later:

```text
embedding?: number[]
```

Potential later relation:

```text
ThoughtConnection
- id
- sourceThoughtId
- relatedThoughtId
- connectionText
- similarityScore?
```

Do not build relation infrastructure before semantic retrieval requires it.

---

## 9. AI Behavior

### Structured thought

Gemma should produce:

```json
{
  "title": "string",
  "summary": "string",
  "categories": ["string"],
  "actionable": true,
  "possibleAction": "string or null",
  "questionToExplore": "string or null"
}
```

Rules:
- preserve the user's intended meaning
- do not invent factual claims
- keep the title concise
- make messy speech understandable
- use limited, reusable categories
- only create an action when appropriate
- make questions useful for continuing thought
- avoid generic advice

All structured model output must be validated with Zod.

### Connection generation

Later input:

```text
currentThought
relatedThoughts[]
```

Gemma should:
1. determine whether a genuinely useful connection exists,
2. avoid forcing a connection,
3. explain a useful connection briefly,
4. identify the useful implication,
5. optionally suggest a question to explore.

If there is no meaningful connection, return no connection.

---

## 10. Architectural Constraints

- Preserve the original transcript; never overwrite it with AI output.
- Clearly separate user-authored content from AI-generated interpretation.
- Validate external/model responses.
- Prefer one application over multiple services.
- Do not introduce LangChain, LangGraph, CrewAI, AutoGen, or another agent framework without a concrete requirement.
- Do not add a separate Python backend for the MVP.
- Do not add premature authentication.
- Do not build multi-device synchronization during the initial MVP.
- Do not build a complex knowledge graph.
- Avoid unnecessary dependencies and abstractions.
- Keep important logic readable and easy to trace.
- Do not silently change the agreed architecture.

### Explicitly out of scope unless requested later

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

## 11. Development Phases

### Phase Rules

- Only implement the phase I explicitly request.
- Never start a later phase automatically.
- Complete phases sequentially.
- Within a phase, work can be broken into small, verifiable milestones.
- A phase is complete only when its definition of done is satisfied.

### Phase 1 — Core Capture Loop

Flow:

**Voice → Transcript → Gemma → Structured Thought → Save → Timeline → Thought Detail**

Build:
- microphone recording
- transcription
- raw transcript preservation
- structured thought extraction
- database persistence
- timeline
- thought detail page

Do not implement yet:
- embeddings
- related thoughts
- semantic search
- Backboard
- Sentry
- authentication
- complex animations

Definition of done:
1. open the app
2. press record
3. speak a messy thought
4. stop recording
5. receive a transcript
6. have Gemma structure it
7. save the thought
8. see it in the timeline
9. open it
10. see both the raw transcript and AI interpretation

### Phase 2 — Semantic Memory

Implement:
- embeddings
- vector storage
- semantic search
- retrieval of related thoughts

Definition of done:
When a thought is opened, relevant previous thoughts can be retrieved and displayed.

### Phase 3 — "You Were Onto Something"

Use Gemma to reason over:
- the current thought
- a small set of retrieved related thoughts

Generate:
- useful connection
- implication
- optional question to explore

Do not manufacture connections.

### Phase 4 — UX Polish

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

### Phase 5 — Deployment and Optional Partner Integrations

After the product is stable:
- deploy to Render
- add Sentry if useful
- consider Backboard
- improve tracing
- prepare screenshots and demo

---

## 12. Performance Philosophy

Capturing a thought should feel faster than opening and writing in a normal notes application.

Eventually measure:
- recording duration
- transcription latency
- structured extraction latency
- embedding latency
- retrieval latency
- connection-generation latency
- total processing time

The user should not necessarily wait for every AI step.

Preferred future UX:

Record
→ transcript obtained
→ thought saved
→ user can leave
→ AI enrichment continues
→ connections appear afterward

Prefer responsiveness over blocking the user.

---

## 13. Submission Direction

The hackathon submission should focus on:
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

Lead with the human problem, not the technology stack.
