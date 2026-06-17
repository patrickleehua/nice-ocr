import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

const QUEUE_STATUSES = ["queued", "active", "retrying"];
const PENDING_ROW_STATUSES = ["pending", "needs_review", "conflict"];

function parseReasons(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [
    documents,
    queued,
    failed,
    pendingRows,
    confirmedRows,
    conflicts,
    autoApprovedRows,
    humanConfirmedRows,
    activeBatch,
    recentFailures,
    openConflicts,
  ] = await Promise.all([
    prisma.document.count(),
    prisma.recognitionJob.count({ where: { status: { in: QUEUE_STATUSES } } }),
    prisma.document.count({ where: { status: "failed" } }),
    prisma.recognitionRow.count({ where: { deletedAt: null, status: { in: PENDING_ROW_STATUSES } } }),
    prisma.recognitionRow.count({ where: { deletedAt: null, status: "confirmed" } }),
    prisma.productConflict.count({ where: { status: "open" } }),
    prisma.recognitionRow.count({ where: { deletedAt: null, reviewClass: "ai_auto" } }),
    prisma.recognitionRow.count({ where: { deletedAt: null, reviewClass: "human" } }),
    prisma.batch.findFirst({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { documents: true, rows: true } } },
    }),
    prisma.document.findMany({
      where: { OR: [{ status: "failed" }, { riskLevel: "high" }] },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.productConflict.findMany({
      where: { status: "open" },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      include: { product: true },
    }),
  ]);

  // 按冲突类型聚合「待处理风险」。
  const riskByType = new Map<string, { type: string; reason: string; severity: string; count: number }>();
  for (const conflict of openConflicts) {
    const sourceIds = parseReasons(conflict.sourceRowIdsJson);
    const entry = riskByType.get(conflict.type) ?? {
      type: conflict.type,
      reason: conflict.reason,
      severity: conflict.severity,
      count: 0,
    };
    entry.count += sourceIds.length || 1;
    riskByType.set(conflict.type, entry);
  }

  const autoApprovalRate = confirmedRows > 0 ? Math.round((autoApprovedRows / confirmedRows) * 100) : 0;

  return NextResponse.json({
    metrics: {
      documents,
      queued,
      failed,
      pendingRows,
      confirmedRows,
      conflicts,
      autoApprovedRows,
      humanConfirmedRows,
      autoApprovalRate,
    },
    activeBatch: activeBatch
      ? {
          id: activeBatch.id,
          name: activeBatch.name,
          status: activeBatch.status,
          documents: activeBatch._count.documents,
          rows: activeBatch._count.rows,
        }
      : null,
    recentFailures: recentFailures.map((doc) => ({
      id: doc.id,
      fileName: doc.originalName,
      risk: doc.riskLevel,
      reason: parseReasons(doc.riskReasonsJson).join("、") || (doc.status === "failed" ? "识别失败" : "需要人工复核"),
      updatedAt: doc.updatedAt,
    })),
    topRisks: Array.from(riskByType.values()).slice(0, 6),
  });
}
