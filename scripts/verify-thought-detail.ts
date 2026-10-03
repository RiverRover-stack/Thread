import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { getDatabase } from "../lib/db/client";
import { getThought } from "../lib/db/thoughts";

loadEnvConfig(process.cwd());

async function main() {
  const db = getDatabase();
  const ids = [randomUUID(), randomUUID()];
  const rawTranscript = "  I should review APIs.\n<script>alert(test)</script> & keep spaces.  ";
  try {
    for (const [index, id] of ids.entries()) {
      await db.thought.create({ data: {
        id, rawTranscript, title: `Detail verification ${id}`,
        summary: "The user plans to review APIs.", categories: ["study"], actionable: index === 0,
        possibleAction: index === 0 ? "Review API notes tomorrow morning." : null,
        questionToExplore: index === 0 ? "Which API should I review first?" : null,
      } });
      const stored = await getThought(id);
      assert.equal(stored?.rawTranscript, rawTranscript);
      const response = await fetch(`http://localhost:3000/thoughts/${id}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      for (const text of ["USER SAID", "AI INTERPRETED", "The user plans to review APIs.", "study", "UTC", "Back to timeline"]) {
        assert.ok(html.includes(text), `Detail page must contain ${text}.`);
      }
      assert.ok(html.includes('class="mt-4 whitespace-pre-wrap break-words leading-relaxed">  I should review APIs.\n&lt;script&gt;alert(test)&lt;/script&gt; &amp; keep spaces.  </p>'));
      assert.ok(!html.includes("<script>alert(test)</script>"), "Transcript content must render as text, never executable HTML.");
      for (const text of index === 0
        ? ["Review API notes tomorrow morning.", "Which API should I review first?"]
        : ["No action suggested.", "No question suggested."]) assert.ok(html.includes(text));
      const timeline = await (await fetch("http://localhost:3000/thoughts")).text();
      assert.ok(timeline.includes(`href="/thoughts/${id}"`));
    }
    for (const id of ["invalid-id", randomUUID()]) {
      const html = await (await fetch(`http://localhost:3000/thoughts/${id}`)).text();
      assert.ok(html.includes("Thought not found"));
    }
    console.log("Detail links, both content sections, exact raw text, HTML escaping, nullable fields, and missing IDs verified.");
  } finally {
    await db.thought.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error("Detail verification failed. Start Thread on localhost:3000 and check PostgreSQL.");
  process.exitCode = 1;
});
