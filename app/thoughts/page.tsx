import Link from "next/link";
import ThoughtTimeline from "@/components/thoughts/ThoughtTimeline";

export const dynamic = "force-dynamic";

export default function ThoughtsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <Link href="/" className="font-semibold text-emerald-900 underline">Record a thought</Link>
      <ThoughtTimeline />
    </main>
  );
}
