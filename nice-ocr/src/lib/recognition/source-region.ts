import { z } from "zod";

export interface SourceRegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceRegion {
  version: 1;
  source: "model" | "layout_ocr";
  kind: "row";
  box: SourceRegionBox;
  confidence?: number;
}

const sourceRegionObjectSchema = z
  .object({
    x: z.union([z.number(), z.string()]).optional(),
    y: z.union([z.number(), z.string()]).optional(),
    w: z.union([z.number(), z.string()]).optional(),
    h: z.union([z.number(), z.string()]).optional(),
    confidence: z.union([z.number(), z.string()]).optional(),
  })
  .passthrough();

export const sourceRegionInputSchema = sourceRegionObjectSchema.optional().catch(undefined);

export function normalizeSourceRegion(raw: unknown): SourceRegion | undefined {
  const parsed = sourceRegionObjectSchema.safeParse(raw);
  if (!parsed.success || !parsed.data) return undefined;
  const box = {
    x: Number(parsed.data.x),
    y: Number(parsed.data.y),
    w: Number(parsed.data.w),
    h: Number(parsed.data.h),
  };
  if (!isFiniteBox(box) || box.w <= 0 || box.h <= 0) return undefined;
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const maxW = 1 - x;
  const maxH = 1 - y;
  const normalized: SourceRegion = {
    version: 1,
    source: "model",
    kind: "row",
    box: {
      x,
      y,
      w: Math.min(maxW, clamp01(box.w)),
      h: Math.min(maxH, clamp01(box.h)),
    },
  };
  const confidence = Number(parsed.data.confidence);
  if (Number.isFinite(confidence)) normalized.confidence = clamp01(confidence);
  if (normalized.box.w <= 0 || normalized.box.h <= 0) return undefined;
  return normalized;
}

export function serializeSourceRegion(region: SourceRegion | undefined): string | undefined {
  return region ? JSON.stringify(region) : undefined;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function isFiniteBox(box: SourceRegionBox) {
  return Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.w) && Number.isFinite(box.h);
}
