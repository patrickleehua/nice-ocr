import { z } from "zod";
import { normalizeMonth } from "@/lib/validation/rules";

export const extractionRowSchema = z.object({
  code: z.string().default(""),
  name: z.string().default(""),
  unit: z.string().default(""),
  qty: z.coerce.number().default(0),
  price: z.coerce.number().default(0),
  amount: z.coerce.number().default(0),
  remark: z.string().default(""),
});

export const extractionResultSchema = z.object({
  date: z.string().default(""),
  items: z.array(extractionRowSchema).default([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export function normalizeExtraction(raw: unknown) {
  const parsed = extractionResultSchema.parse(raw);
  return {
    rawDate: parsed.date,
    normalizedMonth: normalizeMonth(parsed.date),
    rows: parsed.items,
  };
}
