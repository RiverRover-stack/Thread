import assert from "node:assert/strict";
import { test } from "node:test";
import { thoughtConnectionSchema } from "../lib/ai/schemas";

const connected = {
  hasConnection: true,
  connection: "The proposed device benchmark could supply the deployment evidence you wanted.",
  implication: "Measuring latency and memory use could make the portfolio comparison more useful.",
  questionToExplore: "Which deployment metric would best support your comparison?",
};

const unconnected = { hasConnection: false, connection: null, implication: null };

test("accepts connected and unconnected results with an optional or null question", () => {
  for (const result of [connected, unconnected]) {
    for (const questionToExplore of [undefined, null, "What could you explore next?"]) {
      const input = { ...result, questionToExplore };
      assert.deepEqual(thoughtConnectionSchema.parse(input), input);
    }
  }
  const withoutQuestion = {
    hasConnection: connected.hasConnection,
    connection: connected.connection,
    implication: connected.implication,
  };
  assert.deepEqual(thoughtConnectionSchema.parse(withoutQuestion), withoutQuestion);
  assert.deepEqual(thoughtConnectionSchema.parse(unconnected), unconnected);
});

test("rejects contradictory connection flags without repairing the model output", () => {
  for (const field of ["connection", "implication"] as const) {
    const missing = thoughtConnectionSchema.safeParse({ ...connected, [field]: null });
    assert.equal(missing.success, false);
    if (!missing.success) assert.deepEqual(missing.error.issues[0].path, [field]);
    assert.equal(thoughtConnectionSchema.safeParse({ ...unconnected, [field]: "Invented connection" }).success, false);
  }
});

test("rejects missing required fields, wrong types, and unexpected fields", () => {
  const invalid: unknown[] = [
    null, [], {},
    { ...connected, hasConnection: "true" },
    { ...connected, connection: 42 },
    { ...connected, implication: [] },
    { ...connected, questionToExplore: false },
    { ...connected, confidence: 0.9 },
  ];
  for (const field of ["hasConnection", "connection", "implication"] as const) {
    const incomplete: Partial<typeof connected> = { ...connected };
    delete incomplete[field];
    invalid.push(incomplete);
  }
  for (const result of invalid) assert.equal(thoughtConnectionSchema.safeParse(result).success, false);
});

test("rejects blank or oversized text and accepts exact length limits", () => {
  for (const field of ["connection", "implication", "questionToExplore"] as const) {
    const limit = field === "questionToExplore" ? 300 : 600;
    const atLimit = field === "questionToExplore" ? "x".repeat(limit - 1) + "?" : "x".repeat(limit);
    assert.equal(thoughtConnectionSchema.safeParse({ ...connected, [field]: atLimit }).success, true);
    for (const invalidText of ["", "   ", "x" + atLimit]) {
      assert.equal(thoughtConnectionSchema.safeParse({ ...connected, [field]: invalidText }).success, false);
    }
  }
  assert.equal(thoughtConnectionSchema.safeParse({ ...connected, questionToExplore: "Only a statement" }).success, false);
});

test("trims generated text before returning a validated result", () => {
  assert.deepEqual(thoughtConnectionSchema.parse({
    ...connected,
    connection: `  ${connected.connection}  `,
    implication: `\n${connected.implication}\n`,
    questionToExplore: ` ${connected.questionToExplore} `,
  }), connected);
});
