// Home Page

import VoiceRecorder from "@/components/capture/VoiceRecorder";
import ThoughtTimeline from "@/components/thoughts/ThoughtTimeline";
import Link from "next/link";
import { Suspense } from "react";
import TimelineLoading from "@/components/thoughts/TimelineLoading";
import { headers } from "next/headers";
import { accessFailure } from "@/lib/demo-access";
import { publicDemo } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (accessFailure(await headers())) return <main>Access denied. Reload Thread to sign in.</main>;
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-12">
      <p className="mb-8 text-lg font-semibold tracking-tight">Thread</p>
      <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
        Don&apos;t interrupt a thought to save it.
      </h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">
        A place for the ideas that arrive before you have the words in order.
      </p>
      <VoiceRecorder hostedInference={process.env.AI_PROVIDER === "google"} publicDemo={publicDemo()} />
      {publicDemo() && <aside className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-600">
        <p>Your thoughts belong to this browser workspace. Clearing cookies loses access. Avoid sensitive information in this public demo.</p>
        <p className="mt-3 font-semibold text-stone-900">Try two related thoughts:</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>I remember APIs better when I try one tiny request before reading all the documentation.</li>
          <li>Today I learned a new library by building the smallest working example. Doing it helped the concepts stick.</li>
        </ol>
      </aside>}
      <div className="mt-6"><Link href="/thoughts" className="inline-flex min-h-11 items-center rounded font-semibold text-emerald-900 underline focus-visible:outline-2 focus-visible:outline-offset-4">View your timeline</Link></div>
      <Suspense fallback={<TimelineLoading />}>
        <ThoughtTimeline />
      </Suspense>
    </main>
  );
}
