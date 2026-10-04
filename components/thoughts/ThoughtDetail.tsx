import type { getThought } from "@/lib/db/thoughts";

export default function ThoughtDetail({ thought }: { thought: NonNullable<Awaited<ReturnType<typeof getThought>>> }) {
  return (
    <article className="mt-8 min-w-0">
      <p className="text-xs font-semibold tracking-widest text-stone-500">AI-GENERATED TITLE</p>
      <h1 className="mt-2 break-words text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{thought.title}</h1>
      <time dateTime={thought.createdAt.toISOString()} className="mt-3 block text-sm text-stone-600">
        {thought.createdAt.toLocaleString("en-GB", {
          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
        })} UTC
      </time>

      <section aria-labelledby="source-heading" className="mt-8 rounded-2xl border border-stone-300 bg-white p-5 sm:p-8">
        <h2 id="source-heading" className="text-sm font-semibold tracking-widest">USER SAID</h2>
        <p className="mt-2 text-xs text-stone-500">Original transcript, preserved as transcribed.</p>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed">{thought.rawTranscript}</p>
      </section>

      <section aria-labelledby="interpretation-heading" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-8">
        <h2 id="interpretation-heading" className="text-sm font-semibold tracking-widest text-emerald-900">AI INTERPRETED</h2>
        <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-stone-700">{thought.summary}</p>
        <ul aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
          {thought.categories.map((category) => (
            <li key={category} className="max-w-full break-words rounded-full bg-white px-3 py-1 text-sm text-stone-700">{category}</li>
          ))}
        </ul>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-white/80 p-4">
          <h3 className="font-semibold">Possible action</h3>
          <p className="mt-2 break-words leading-relaxed text-stone-700">{thought.possibleAction ?? "No action suggested."}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-white/80 p-4">
          <h3 className="font-semibold">Question to explore</h3>
          <p className="mt-2 break-words leading-relaxed text-stone-700">{thought.questionToExplore ?? "No question suggested."}</p>
        </div>
        </div>
      </section>
    </article>
  );
}
