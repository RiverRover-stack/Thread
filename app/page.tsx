// Home Page

import VoiceRecorder from "@/components/capture/VoiceRecorder";
import ThoughtTimeline from "@/components/thoughts/ThoughtTimeline";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-12">
      <p className="mb-8 text-lg font-semibold tracking-tight">Thread</p>
      <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
        Don&apos;t interrupt a thought to save it.
      </h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">
        A place for the ideas that arrive before you have the words in order.
      </p>
      <VoiceRecorder />
      <div className="mt-6"><Link href="/thoughts" className="font-semibold text-emerald-900 underline">View your timeline</Link></div>
      <ThoughtTimeline />
    </main>
  );
}
