import Link from "next/link";

export default function LoadingThought() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <Link href="/thoughts" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">← Back to timeline</Link>
      <p role="status" className="mt-8 text-sm text-stone-600">Loading your thought…</p>
      <div aria-hidden="true" className="mt-4 space-y-6 motion-safe:animate-pulse">
        <div className="h-10 w-3/4 rounded bg-stone-200" />
        {[0, 1].map((index) => (
          <div key={index} className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="h-4 w-28 rounded bg-stone-200" />
            <div className="mt-6 h-4 w-full rounded bg-stone-100" />
            <div className="mt-3 h-4 w-3/4 rounded bg-stone-100" />
          </div>
        ))}
      </div>
    </main>
  );
}
