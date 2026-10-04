export default function TimelineLoading() {
  return (
    <section aria-labelledby="timeline-loading-heading" className="mt-12 border-t border-stone-300 pt-8">
      <h2 id="timeline-loading-heading" className="text-2xl font-semibold">Your thoughts</h2>
      <p role="status" className="mt-2 text-sm text-stone-600">Loading saved thoughts…</p>
      <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <div className="h-3 w-36 rounded bg-stone-200" />
            <div className="mt-4 h-6 w-3/4 rounded bg-stone-200" />
            <div className="mt-4 h-4 w-full rounded bg-stone-100" />
            <div className="mt-2 h-4 w-2/3 rounded bg-stone-100" />
            <div className="mt-5 h-6 w-20 rounded-full bg-stone-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
