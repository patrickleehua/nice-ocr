import { NextResponse } from "next/server";
import { confirmRecognitionRows } from "@/lib/workflows/rows";

export const runtime = "nodejs";

/**
 * 批量确认识别行。支持三种选择方式（按优先级）：
 *   1. rowIds[]    — 精确确认所选行（逐行确认 / 多选确认）。
 *   2. documentId  — 确认整单全部行（审核台「确认本单所有行」）。
 *   3. batchId     — 按批次确认，默认仅低风险（onlyLowRisk）。
 * 三者都缺失时返回 400，避免空选择误确认全部数据。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const updated = await confirmRecognitionRows({
    rowIds: Array.isArray(body.rowIds) ? body.rowIds : undefined,
    documentId: body.documentId,
    batchId: body.batchId,
    onlyLowRisk: body.onlyLowRisk,
  });

  if (updated === null) {
    return NextResponse.json({ error: "Provide rowIds[], documentId or batchId" }, { status: 400 });
  }
  return NextResponse.json({ updated });
}
