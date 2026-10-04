import Link from "next/link";
import { notFound } from "next/navigation";
import { getThought } from "@/lib/db/thoughts";
import ThoughtDetail from "@/components/thoughts/ThoughtDetail";
import RetryLoading from "@/components/thoughts/RetryLoading";
import RelatedThoughts from "@/components/thoughts/RelatedThoughts";

export const dynamic = "force-dynamic";

export default async function ThoughtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let thought: Awaited<ReturnType<typeof getThought>>;
  try {
    thought = await getThought(id);
  } catch {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
        <nav aria-label="Thought navigation" className="flex flex-wrap gap-x-6 gap-y-3">
          <Link href="/thoughts" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">← Back to timeline</Link>
          <Link href="/#capture-heading" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">Record a thought</Link>
        </nav>
        <h1 className="mt-8 text-2xl font-semibold">Could not load this thought</h1>
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-red-900">This thought couldn&apos;t load right now. Try again in a moment.</p>
        <RetryLoading />
      </main>
    );
  }
  // Keep this outside the catch: notFound uses a special Next.js control-flow exception.
  if (!thought) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <nav aria-label="Thought navigation" className="flex flex-wrap gap-x-6 gap-y-3">
        <Link href="/thoughts" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">← Back to timeline</Link>
        <Link href="/#capture-heading" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">Record a thought</Link>
      </nav>
      <ThoughtDetail thought={thought} />
      <RelatedThoughts key={thought.id} thoughtId={thought.id} />
    </main>
  );
}
