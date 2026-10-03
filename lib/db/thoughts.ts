import "server-only";
import { getDatabase } from "./client";

export async function listThoughts() {
  return getDatabase().thought.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, summary: true, categories: true, createdAt: true },
  });
}
