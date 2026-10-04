import Link from "next/link";

export default function ThoughtNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      <h1 className="text-2xl font-semibold">Thought not found</h1>
      <p className="mt-4 text-stone-600">This link is invalid or the thought no longer exists.</p>
      <nav aria-label="Thought navigation" className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
        <Link href="/thoughts" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">← Back to timeline</Link>
        <Link href="/#capture-heading" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">Record a thought</Link>
      </nav>
    </main>
  );
}
