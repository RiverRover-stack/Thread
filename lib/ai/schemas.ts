import { z } from "zod";

const nonEmptyText = (maximum: number) => z.string().trim().min(1).max(maximum);

// Keep this base schema free of refinements so it can also become Ollama's JSON schema.
const structuredThoughtBaseSchema = z.object({
  title: nonEmptyText(80),
  summary: nonEmptyText(600),
  categories: z.array(nonEmptyText(40)).min(1).max(4),
  actionable: z.boolean(),
  possibleAction: nonEmptyText(300).nullable(),
  questionToExplore: nonEmptyText(300).regex(/^.*\?$/, "The exploration question must end with a question mark.").nullable(),
}).strict();

export const structuredThoughtSchema = structuredThoughtBaseSchema.superRefine((thought, context) => {
  if (thought.actionable && thought.possibleAction === null) {
    context.addIssue({
      code: "custom",
      path: ["possibleAction"],
      message: "An actionable thought must include a possible action.",
    });
  }
  if (!thought.actionable && thought.possibleAction !== null) {
    context.addIssue({
      code: "custom",
      path: ["possibleAction"],
      message: "A non-actionable thought must not include a possible action.",
    });
  }

  const normalizedCategories = thought.categories.map((category) => category.toLocaleLowerCase());
  if (new Set(normalizedCategories).size !== normalizedCategories.length) {
    context.addIssue({
      code: "custom",
      path: ["categories"],
      message: "Categories must be unique.",
    });
  }
});

export const structuredThoughtJsonSchema = z.toJSONSchema(structuredThoughtBaseSchema, {
  target: "draft-7",
});

export type StructuredThought = z.infer<typeof structuredThoughtSchema>;

const thoughtConnectionBaseSchema = z.object({
  hasConnection: z.boolean(),
  connection: nonEmptyText(600).nullable(),
  implication: nonEmptyText(600).nullable(),
  questionToExplore: nonEmptyText(300)
    .regex(/^.*\?$/, "The exploration question must end with a question mark.")
    .nullable().optional(),
}).strict();

// JSON Schema guides generation; this refinement also checks meaning between fields.
export const thoughtConnectionSchema = thoughtConnectionBaseSchema.superRefine((result, context) => {
  for (const field of ["connection", "implication"] as const) {
    if (result.hasConnection && result[field] === null) {
      context.addIssue({
        code: "custom", path: [field],
        message: "A useful connection must include both a connection and an implication.",
      });
    }
    if (!result.hasConnection && result[field] !== null) {
      context.addIssue({
        code: "custom", path: [field],
        message: "When no useful connection exists, connection and implication must be null.",
      });
    }
  }
});

export const thoughtConnectionJsonSchema = z.toJSONSchema(thoughtConnectionBaseSchema, {
  target: "draft-7",
});

export type ThoughtConnectionResult = z.infer<typeof thoughtConnectionSchema>;
