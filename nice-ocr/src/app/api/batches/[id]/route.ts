import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { computeReviewState, emptyRowStats, rowStatsByDocument } from "@/lib/workflows/documents";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      _count: { select: { rows: true, jobs: true, documents: true } },
    },
  });

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  // 汇总每个文档的行状态，供审核台文档选择器可视化“做了哪些”。
  const grouped = await prisma.recognitionRow.groupBy({
    by: ["documentId", "status"],
    where: { batchId: id, deletedAt: null },
    _count: { _all: true },
  });
  const statMap = rowStatsByDocument(grouped);

  const documents = batch.documents.map((document) => {
    const stat = statMap.get(document.id) ?? emptyRowStats();
    return { ...document, rowStats: stat, reviewState: computeReviewState(stat) };
  });

  return NextResponse.json({ batch: { ...batch, documents } });
}

// 封批/撤销：{ closed: boolean } → 写入/清除 closedAt（审核收口标记，不改 status）。
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { closed?: boolean };
  const existing = await prisma.batch.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const batch = await prisma.batch.update({
    where: { id },
    data: { closedAt: body.closed ? new Date() : null },
  });
  return NextResponse.json({ batch });
}
