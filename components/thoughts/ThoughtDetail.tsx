import type { Thought } from "@/generated/prisma/client";

export default function ThoughtDetail({ thought }: { thought: Thought }) {
  return (
    <article className="mt-8">
      <p className="text-xs font-semibold tracking-widest text-stone-500">AI-GENERATED TITLE</p>
      <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl">{thought.title}</h1>
      <time dateTime={thought.createdAt.toISOString()} className="mt-3 block text-sm text-stone-600">
        {thought.createdAt.toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
        })} UTC
      </time>

      <section aria-labelledby="source-heading" className="mt-8 rounded-xl border border-stone-300 bg-white p-5 sm:p-6">
        <h2 id="source-heading" className="text-sm font-semibold tracking-widest">USER SAID</h2>
        <p className="mt-2 text-xs text-stone-500">Original transcript, preserved as transcribed.</p>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">{thought.rawTranscript}</p>
      </section>

      <section aria-labelledby="interpretation-heading" className="mt-6 rounded-xl bg-stone-100 p-5 sm:p-6">
        <h2 id="interpretation-heading" className="text-sm font-semibold tracking-widest text-emerald-900">AI INTERPRETED</h2>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-stone-700">{thought.summary}</p>
        <ul aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
          {thought.categories.map((category) => (
            <li key={category} className="rounded-full bg-white px-3 py-1 text-sm text-stone-700">{category}</li>
          ))}
        </ul>
        <div className="mt-6">
          <h3 className="font-semibold">Possible action</h3>
          <p className="mt-2 break-words leading-relaxed text-stone-700">{thought.possibleAction ?? "No action suggested."}</p>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold">Question to explore</h3>
          <p className="mt-2 break-words leading-relaxed text-stone-700">{thought.questionToExplore ?? "No question suggested."}</p>
        </div>
      </section>
    </article>
  );
}
