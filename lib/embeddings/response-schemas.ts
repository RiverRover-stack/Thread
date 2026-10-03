import { z } from "zod";

export const indexingResponseSchema = z.object({
  id: z.uuid(), indexed: z.literal(true), reused: z.boolean(),
});

export const relatedThoughtsResponseSchema = z.object({
  relatedThoughts: z.array(z.object({
    id: z.uuid(), title: z.string().min(1).max(80), summary: z.string().min(1).max(600),
    createdAt: z.iso.datetime(), similarity: z.number().finite().min(-1).max(1),
  }).strict()).max(5),
}).strict();

export type RelatedThoughtCard = z.infer<typeof relatedThoughtsResponseSchema>["relatedThoughts"][number];
