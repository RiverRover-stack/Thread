import { listThoughts } from "@/lib/db/thoughts";
import Link from "next/link";
import RetryLoading from "./RetryLoading";

export default async function ThoughtTimeline() {
  let thoughts: Awaited<ReturnType<typeof listThoughts>>;
  try {
    thoughts = await listThoughts();
  } catch {
    return (
      <section aria-labelledby="timeline-heading" className="mt-12 border-t border-stone-300 pt-8">
        <h2 id="timeline-heading" className="text-2xl font-semibold">Your thoughts</h2>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p role="alert" className="text-sm leading-relaxed text-red-900">Your timeline couldn&apos;t load. Try again in a moment.</p>
          <RetryLoading />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="timeline-heading" className="mt-12 border-t border-stone-300 pt-8">
      <h2 id="timeline-heading" className="text-2xl font-semibold">Your thoughts</h2>
      <p className="mt-2 text-sm text-stone-600">A place to pick up your thinking. Newest thoughts first.</p>
      {thoughts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white p-6 sm:p-8">
          <h3 className="text-lg font-semibold">Your first thought starts here</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-600">An unfinished idea, a question, or something you want to remember. Record it and it will appear here.</p>
          <Link href="/#capture-heading" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-emerald-900 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">Record your first thought</Link>
        </div>
      ) : (
        <ol className="mt-6 space-y-4">
          {thoughts.map((thought) => (
            <li key={thought.id}>
              <Link href={`/thoughts/${thought.id}`} aria-labelledby={`thought-title-${thought.id}`} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">
              <article className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 transition-colors group-hover:border-emerald-700 group-hover:bg-emerald-50/30 sm:p-6">
                <time dateTime={thought.createdAt.toISOString()} className="text-xs text-stone-500">
                  {thought.createdAt.toLocaleString("en-GB", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                  })} UTC
                </time>
                <h3 id={`thought-title-${thought.id}`} className="mt-3 break-words text-lg leading-snug font-semibold text-emerald-950 sm:text-xl">{thought.title}</h3>
                <p className="mt-3 line-clamp-3 break-words text-sm leading-relaxed text-stone-600 sm:text-base">{thought.summary}</p>
                <ul aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
                  {thought.categories.map((category) => (
                    <li key={category} className="max-w-full break-words rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{category}</li>
                  ))}
                </ul>
                <p aria-hidden="true" className="mt-4 text-sm font-semibold text-emerald-900">Open thought <span className="ml-1">→</span></p>
              </article>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
