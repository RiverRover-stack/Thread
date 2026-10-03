import Link from "next/link";
import { notFound } from "next/navigation";
import { getThought } from "@/lib/db/thoughts";
import ThoughtDetail from "@/components/thoughts/ThoughtDetail";
import RetryLoading from "@/components/thoughts/RetryLoading";

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
          <Link href="/thoughts" className="font-semibold text-emerald-900 underline">Back to timeline</Link>
          <Link href="/" className="font-semibold text-emerald-900 underline">Record a thought</Link>
        </nav>
        <h1 className="mt-8 text-2xl font-semibold">Could not load this thought</h1>
        <p role="alert" className="mt-4 text-stone-700">Check PostgreSQL and your database configuration, then retry.</p>
        <RetryLoading />
      </main>
    );
  }
  // Keep this outside the catch: notFound uses a special Next.js control-flow exception.
  if (!thought) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <nav aria-label="Thought navigation" className="flex flex-wrap gap-x-6 gap-y-3">
        <Link href="/thoughts" className="font-semibold text-emerald-900 underline">Back to timeline</Link>
        <Link href="/" className="font-semibold text-emerald-900 underline">Record a thought</Link>
      </nav>
      <ThoughtDetail thought={thought} />
    </main>
  );
}
