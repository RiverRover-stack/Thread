"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RetryLoading() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
      className="mt-3 min-h-11 rounded px-2 py-2 text-sm font-semibold text-emerald-900 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-wait disabled:opacity-60">
      {pending ? "Retrying…" : "Retry loading"}
    </button>
  );
}
