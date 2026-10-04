import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "./db/client";
import { publicDemo, requireWorkspaceScope } from "./workspace";

export type UsageStage = "transcribe" | "structure" | "embed" | "connect" | "save";
export class UsageError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfter?: number) { super(message); this.name = "UsageError"; }
}
export function reportStorageFailure() {
  // Report the failing layer without database errors, credentials, or visitor IDs.
  try { Sentry.captureMessage("Thread allowance storage failed", { level: "error", tags: { "thread.stage": "allowance" } }); }
  catch { /* Monitoring cannot change the fail-closed response. */ }
}
export function usageFailure(error: unknown): Response | null {
  return error instanceof UsageError ? Response.json({ error: error.message }, { status: error.status,
    headers: { "Cache-Control": "private, no-store", ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } }) : null;
}
export function usageWindows(now = new Date(), timezone = process.env.THREAD_QUOTA_TIMEZONE || "Asia/Kolkata") {
  if (!["UTC", "Asia/Kolkata"].includes(timezone)) throw new UsageError("Demo allowance configuration is unavailable.", 503);
  const offset = timezone === "UTC" ? 0 : 330 * 60_000;
  const shifted = now.getTime() + offset;
  const day = new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - offset);
  const hour = new Date(Math.floor(shifted / 3_600_000) * 3_600_000 - offset);
  return { timezone, day, hour, dayReset: new Date(day.getTime() + 86_400_000), hourReset: new Date(hour.getTime() + 3_600_000) };
}
export function publicAIEnabled() { return process.env.THREAD_PUBLIC_AI_ENABLED === "true"; }
export function assertPublicAI(workspace: string | null) {
  if (!publicDemo()) return;
  requireWorkspaceScope(workspace);
  if (!publicAIEnabled()) throw new UsageError("Demo AI is temporarily paused. Your saved thoughts remain available.", 503);
}
type Counter = { scope: string; bucket: string; startsAt: Date; resetsAt: Date; limit: number };
function counters(stage: UsageStage, workspace: string, now: Date): Counter[] {
  // Both calendars are mandatory; the environment setting only selects display time.
  return ["UTC", "Asia/Kolkata"].flatMap(timezone => {
    const window = usageWindows(now, timezone);
    return [
    { scope: "global", bucket: `${window.timezone}:day`, startsAt: window.day, resetsAt: window.dayReset, limit: stage === "save" ? 1000 : stage === "transcribe" ? 30 : 60 },
    ...(stage === "save" ? [] : [{ scope: workspace, bucket: `${window.timezone}:hour`, startsAt: window.hour, resetsAt: window.hourReset, limit: stage === "transcribe" ? 5 : 10 }]),
    ];
  });
}
// One transaction lock serializes short reservations, never the provider work.
export async function lockUsage(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(746872656164::bigint)`;
}
export async function reserveInTransaction(tx: Prisma.TransactionClient, stage: UsageStage, workspace: string, now = new Date()) {
  for (const counter of counters(stage, workspace, now)) {
    const row = await tx.usageCounter.upsert({ where: { stage_scope_bucket_startsAt: { stage, scope: counter.scope, bucket: counter.bucket, startsAt: counter.startsAt } },
      create: { stage, scope: counter.scope, bucket: counter.bucket, startsAt: counter.startsAt, used: 0 }, update: {} });
    if (row.used >= counter.limit) throw new UsageError("Demo allowance reached. Please try again after the reset.", 429,
      Math.max(1, Math.ceil((counter.resetsAt.getTime() - now.getTime()) / 1000)));
    await tx.usageCounter.update({ where: { stage_scope_bucket_startsAt: { stage, scope: counter.scope, bucket: counter.bucket, startsAt: counter.startsAt } }, data: { used: { increment: 1 } } });
  }
}
export async function reserveProviderCall(stage: Exclude<UsageStage, "save">, workspace: string | null) {
  if (!publicDemo()) return;
  assertPublicAI(workspace);
  try {
    await getDatabase().$transaction(async tx => { await lockUsage(tx); await reserveInTransaction(tx, stage, workspace!); }, { maxWait: 5000, timeout: 10000 });
  } catch (error) {
    if (error instanceof UsageError) throw error;
    reportStorageFailure();
    throw new UsageError("Demo allowances could not be checked. Please retry shortly.", 503);
  }
  // CHALLENGE: predict why a provider timeout must not refund this reservation.
  // TODO(you): explain in PUBLIC_DEMO.md. Hints: the provider may have received it;
  // a timeout describes our wait, not billing. Verify against the failed-call test.
}
export async function recordingUsage(workspace: string) {
  const now = new Date();
  const windows = usageWindows(now);
  try {
    const limits = counters("transcribe", workspace, now);
    const rows = await Promise.all(limits.map(c => getDatabase().usageCounter.findUnique({
      where: { stage_scope_bucket_startsAt: { stage: "transcribe", scope: c.scope, bucket: c.bucket, startsAt: c.startsAt } },
    })));
    return { enabled: publicAIEnabled(), timezone: windows.timezone,
      remainingAttempts: Math.min(...limits.map((counter, index) => Math.max(0, counter.limit - (rows[index]?.used || 0)))),
      hourlyResetAt: windows.hourReset.toISOString(), dailyResetAt: windows.dayReset.toISOString(),
      resets: ["UTC", "Asia/Kolkata"].map(timezone => {
        const window = usageWindows(now, timezone);
        return { timezone, hourlyResetAt: window.hourReset.toISOString(), dailyResetAt: window.dayReset.toISOString() };
      }), maxRecordingSeconds: 60 };
  } catch { reportStorageFailure(); throw new UsageError("Demo allowances could not be checked. Please retry shortly.", 503); }
}
