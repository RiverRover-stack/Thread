import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { lockUsage, reserveInTransaction, usageWindows, UsageError } from "../lib/usage";

async function main() {
loadEnvConfig(process.cwd());
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname), "Use the separate localhost development database");
const now = new Date(Date.UTC(2100 + randomInt(100), randomInt(12), 1 + randomInt(27), 18, 45));
const scopes = Array.from({ length: 12 }, () => randomBytes(24).toString("base64url"));
const global = globalThis as unknown as { threadPrisma?: ReturnType<typeof getDatabase> };
const windows: { bucket: string; startsAt: Date }[] = [];
try {
  for (const timezone of ["UTC", "Asia/Kolkata"]) {
    process.env.THREAD_QUOTA_TIMEZONE = timezone;
    const current = new Date(now.getTime() + (timezone === "UTC" ? 0 : 2 * 86_400_000));
    const window = usageWindows(current, timezone);
    const key = { stage: "structure", scope: "global", bucket: `${timezone}:day`, startsAt: window.day };
    for (const calendar of ["UTC", "Asia/Kolkata"]) {
      const other = usageWindows(current, calendar);
      windows.push({ bucket: `${calendar}:day`, startsAt: other.day }, { bucket: `${calendar}:hour`, startsAt: other.hour });
    }
    assert.equal(await getDatabase().usageCounter.findUnique({ where: { stage_scope_bucket_startsAt: key } }), null, "Choose a fresh test window");
    await getDatabase().usageCounter.create({ data: { ...key, used: 59 } });
    const outcomes = await Promise.allSettled(scopes.map(scope => getDatabase().$transaction(async tx => {
      await lockUsage(tx); await reserveInTransaction(tx, "structure", scope, current);
    }, { maxWait: 10000, timeout: 10000 })));
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    for (const result of outcomes) if (result.status === "rejected") assert.ok(result.reason instanceof UsageError && result.reason.status === 429);
    assert.equal((await getDatabase().usageCounter.findUniqueOrThrow({ where: { stage_scope_bucket_startsAt: key } })).used, 60);
    const hourRows = await getDatabase().usageCounter.findMany({ where: { stage: "structure", scope: { in: scopes }, bucket: `${timezone}:hour`, startsAt: window.hour } });
    assert.equal(hourRows.length, 1, "Rejected transactions must not create visitor allowance rows");
    assert.equal(hourRows[0].used, 1);
    const otherTimezone = timezone === "UTC" ? "Asia/Kolkata" : "UTC";
    const otherWindow = usageWindows(current, otherTimezone);
    const otherKey = { ...key, bucket: `${otherTimezone}:day`, startsAt: otherWindow.day };
    assert.equal((await getDatabase().usageCounter.findUniqueOrThrow({ where: { stage_scope_bucket_startsAt: otherKey } })).used, 1, "The successful reservation must increment both calendars");
    await getDatabase().$disconnect(); delete global.threadPrisma;
    assert.equal((await getDatabase().usageCounter.findUniqueOrThrow({ where: { stage_scope_bucket_startsAt: key } })).used, 60, "Counters survive a fresh application connection");
    // A visitor rejection after the global increment must roll the entire transaction back.
    const visitorKey = { ...key, stage: "transcribe", scope: scopes[0], bucket: `${timezone}:hour`, startsAt: window.hour };
    await getDatabase().usageCounter.create({ data: { ...visitorKey, used: 5 } });
    await assert.rejects(getDatabase().$transaction(async tx => { await lockUsage(tx); await reserveInTransaction(tx, "transcribe", scopes[0], current); }), UsageError);
    assert.equal(await getDatabase().usageCounter.findUnique({ where: { stage_scope_bucket_startsAt: { ...key, stage: "transcribe" } } }), null);
    assert.equal(await getDatabase().usageCounter.findUnique({ where: { stage_scope_bucket_startsAt: { ...otherKey, stage: "transcribe" } } }), null);
  }
  console.log("PASS: simultaneous UTC/IST last-slot concurrency (12 competing transactions), cross-calendar rollback, and persisted allowance after reconnect. No provider calls.");
} finally {
  await getDatabase().usageCounter.deleteMany({ where: { scope: { in: ["global", ...scopes] }, OR: windows } });
  await getDatabase().$disconnect();
}
}
main().catch(error => { console.error("Usage database verification failed", { type: error?.name, code: error?.code, actual: typeof error?.actual === "number" ? error.actual : undefined, expected: typeof error?.expected === "number" ? error.expected : undefined, frames: error?.stack?.split("\n").slice(1, 4) }); process.exitCode = 1; });
