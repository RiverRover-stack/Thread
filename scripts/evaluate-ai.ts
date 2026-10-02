import { performance } from "node:perf_hooks";
import { structureThought } from "../lib/ai";

const cases = [
  "I keep forgetting to email Maya about the hackathon demo. Maybe tomorrow morning I should send her the updated link, and I wonder if we should shorten the intro.",
  "While walking I realized I learn APIs better when I build one tiny request first instead of reading all the docs, but I'm not sure why that helps me remember.",
  "The rain hitting the window reminds me of studying at my grandparents' house. There's nothing I need to do, I just don't want to lose that feeling.",
  "I should review my API notes tomorrow morning.",
];

async function main() {
  for (const [index, transcript] of cases.entries()) {
    const startedAt = performance.now();
    const thought = await structureThought(transcript);
    console.log(`\nCase ${index + 1} (${Math.round(performance.now() - startedAt)} ms)`);
    console.log("Transcript:", transcript);
    console.log("Structured:", JSON.stringify(thought, null, 2));
  }
}

void main();

// CHALLENGE (beginner): Add one new thought to the `cases` array near the top.
// Purpose: Learn how an array supplies inputs to our AI processing loop.
// TODO(you): Add "I should review my API notes tomorrow morning." as another item.
// Hint 1: An array is a list between [ and ]; each item here is a quoted string.
// Hint 2: Separate items with commas. Follow the existing lines as examples.
// Verify: Run `npm run ai:eval`; a fourth case should appear. Check whether its
// possibleAction preserves "tomorrow morning". The model may omit it; record what you observe.
