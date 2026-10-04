import Link from "next/link";
import ThoughtTimeline from "@/components/thoughts/ThoughtTimeline";
import { headers } from "next/headers";
import { accessFailure } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  if (accessFailure(await headers())) return <main>Access denied. Reload Thread to sign in.</main>;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <Link href="/#capture-heading" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">← Record a thought</Link>
      <ThoughtTimeline />
    </main>
  );
}
