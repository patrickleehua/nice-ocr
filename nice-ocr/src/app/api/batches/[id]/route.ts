import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

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
  const statMap = new Map<string, { total: number; confirmed: number; conflict: number }>();
  for (const entry of grouped) {
    const stat = statMap.get(entry.documentId) ?? { total: 0, confirmed: 0, conflict: 0 };
    const count = entry._count._all;
    stat.total += count;
    if (entry.status === "confirmed") stat.confirmed += count;
    if (entry.status === "conflict") stat.conflict += count;
    statMap.set(entry.documentId, stat);
  }

  const documents = batch.documents.map((document) => {
    const stat = statMap.get(document.id) ?? { total: 0, confirmed: 0, conflict: 0 };
    let reviewState: "pending" | "partial" | "confirmed" | "conflict" = "pending";
    if (stat.conflict > 0) reviewState = "conflict";
    else if (stat.total > 0 && stat.confirmed === stat.total) reviewState = "confirmed";
    else if (stat.confirmed > 0) reviewState = "partial";
    return { ...document, rowStats: stat, reviewState };
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
