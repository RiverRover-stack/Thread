import "server-only";
import { getDatabase } from "./client";
import { z } from "zod";

export const thoughtContentSelect = {
  id: true, rawTranscript: true, title: true, summary: true, categories: true,
  actionable: true, possibleAction: true, questionToExplore: true, createdAt: true,
} as const;

export async function listThoughts() {
  return getDatabase().thought.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, summary: true, categories: true, createdAt: true },
  });
}

export async function getThought(id: string) {
  // URL parameters are external input. Invalid UUIDs should be a 404, not a SQL error.
  if (!z.uuid().safeParse(id).success) return null;
  return getDatabase().thought.findUnique({ where: { id }, select: thoughtContentSelect });
}
