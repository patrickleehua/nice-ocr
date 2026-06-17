import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRecognitionSettings } from "@/lib/recognition/settings";
import { normalizeApprovalMode } from "@/lib/recognition/review";

export const runtime = "nodejs";

export async function GET() {
  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { documents: true, rows: true, jobs: true },
      },
    },
  });
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  const body = await request.json();
  // 未显式指定审批模式时，继承设置页全局默认。
  const approvalMode = body.approvalMode
    ? normalizeApprovalMode(String(body.approvalMode))
    : (await getRecognitionSettings()).defaults.approvalMode;
  const batch = await prisma.batch.create({
    data: {
      name: String(body.name ?? "未命名批次"),
      notes: body.notes ? String(body.notes) : null,
      strategy: body.strategy ? String(body.strategy) : "balanced",
      approvalMode,
      status: "draft",
    },
  });
  return NextResponse.json({ batch }, { status: 201 });
}
