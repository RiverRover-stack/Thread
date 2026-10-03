"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function RetryLoading() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
      className="mt-4 font-semibold text-emerald-900 underline disabled:opacity-60">
      {pending ? "Retrying…" : "Retry loading"}
    </button>
  );
}
