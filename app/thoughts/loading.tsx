import TimelineLoading from "@/components/thoughts/TimelineLoading";

export default function LoadingThoughts() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-12">
      <div aria-hidden="true" className="h-11 w-36 rounded bg-stone-200 motion-safe:animate-pulse" />
      <TimelineLoading />
    </main>
  );
}
