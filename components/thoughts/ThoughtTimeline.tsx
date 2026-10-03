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
        <p role="alert" className="mt-4 text-red-800">Could not load saved thoughts. Check PostgreSQL and your database configuration.</p>
        <RetryLoading />
      </section>
    );
  }

  return (
    <section aria-labelledby="timeline-heading" className="mt-12 border-t border-stone-300 pt-8">
      <h2 id="timeline-heading" className="text-2xl font-semibold">Your thoughts</h2>
      <p className="mt-2 text-sm text-stone-600">Saved thoughts, newest first.</p>
      {thoughts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 p-6 text-stone-600">No saved thoughts yet. Record your first thought to start your timeline.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {thoughts.map((thought) => (
            <li key={thought.id}>
              <article className="rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
                <time dateTime={thought.createdAt.toISOString()} className="text-xs text-stone-500">
                  {thought.createdAt.toLocaleString("en-GB", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
                  })} UTC
                </time>
                <h3 className="mt-2 break-words text-lg font-semibold">
                  <Link href={`/thoughts/${thought.id}`} className="text-emerald-950 underline decoration-stone-300 underline-offset-4 hover:decoration-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4">
                    {thought.title}
                  </Link>
                </h3>
                <p className="mt-2 break-words leading-relaxed text-stone-600">{thought.summary}</p>
                <ul aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
                  {thought.categories.map((category) => (
                    <li key={category} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{category}</li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
