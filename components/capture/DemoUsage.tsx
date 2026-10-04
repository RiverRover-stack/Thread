"use client";
import { useEffect, useState } from "react";

type Allowance = { remainingAttempts: number; enabled: boolean; hourlyResetAt: string; dailyResetAt: string; timezone: string;
  resets: { timezone: string; hourlyResetAt: string; dailyResetAt: string }[] };
export default function DemoUsage({ refreshKey }: { refreshKey: string }) {
  const [usage, setUsage] = useState<Allowance | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/usage", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Usage unavailable");
      const data = await response.json();
      if (typeof data.remainingAttempts !== "number" || !["UTC", "Asia/Kolkata"].includes(data.timezone)) throw new Error("Invalid usage");
      setUsage(data); setUnavailable(false);
    }).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [refreshKey]);
  if (unavailable) return <p role="status" className="mt-3 text-sm text-stone-600">Demo allowance could not be loaded. Requests still require a server allowance check.</p>;
  if (!usage) return <p className="mt-3 text-sm text-stone-600">Checking demo allowance…</p>;
  const format = (value: string, timezone: string) => new Date(value).toLocaleString("en-GB", { timeZone: timezone });
  return <p role="status" className="mt-3 text-sm text-stone-600">
    {usage.enabled ? `${usage.remainingAttempts} recording attempts available. Each attempt allows up to 60 seconds.` : "Demo AI is paused. Saved thoughts remain readable."}
    {usage.resets?.map(reset => <span key={reset.timezone}>{" "}{reset.timezone === "UTC" ? "UTC" : "IST"}: hourly reset {format(reset.hourlyResetAt, reset.timezone)}; daily reset {format(reset.dailyResetAt, reset.timezone)}.</span>)}
    {" "}Both calendars apply.
  </p>;
}
