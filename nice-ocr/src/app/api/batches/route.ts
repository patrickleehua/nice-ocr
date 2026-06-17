import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRecognitionSettings } from "@/lib/recognition/settings";
import { normalizeApprovalMode } from "@/lib/recognition/review";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 20)));
  const where = {
    ...(searchParams.get("search") ? { name: { contains: searchParams.get("search") as string } } : {}),
    ...(searchParams.get("status") ? { status: searchParams.get("status") as string } : {}),
  };

  const [batches, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: { documents: true, rows: true, jobs: true },
        },
      },
    }),
    prisma.batch.count({ where }),
  ]);
  return NextResponse.json({ batches, total, page, pageSize });
}

export async function POST(request: Request) {
  const body = await request.json();
  // 未显式指定时，审批模式与主/副识别模型均继承设置页全局默认。
  const defaults = (await getRecognitionSettings()).defaults;
  const approvalMode = body.approvalMode
    ? normalizeApprovalMode(String(body.approvalMode))
    : defaults.approvalMode;
  const pickKey = (value: unknown, fallback: string | null) => {
    const normalized = value == null ? "" : String(value).trim();
    return normalized ? normalized : fallback;
  };
  const batch = await prisma.batch.create({
    data: {
      name: String(body.name ?? "未命名批次"),
      notes: body.notes ? String(body.notes) : null,
      strategy: body.strategy ? String(body.strategy) : "balanced",
      approvalMode,
      primaryProviderKey: pickKey(body.primaryProviderKey, defaults.primaryProviderKey),
      secondaryProviderKey: pickKey(body.secondaryProviderKey, defaults.secondaryProviderKey),
      status: "draft",
    },
  });
  return NextResponse.json({ batch }, { status: 201 });
}
