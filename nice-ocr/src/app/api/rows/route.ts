import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(20, Number(searchParams.get("pageSize") ?? 50)));
  const where = {
    deletedAt: null,
    ...(searchParams.get("batchId") ? { batchId: searchParams.get("batchId") as string } : {}),
    ...(searchParams.get("status") ? { status: searchParams.get("status") as string } : {}),
    ...(searchParams.get("risk") ? { riskLevel: searchParams.get("risk") as string } : {}),
    ...(searchParams.get("auditState") ? { auditState: searchParams.get("auditState") as string } : {}),
    ...(searchParams.get("month") ? { normalizedMonth: searchParams.get("month") as string } : {}),
    ...(searchParams.get("code") ? { code: { contains: searchParams.get("code") as string } } : {}),
    ...(searchParams.get("name") ? { name: { contains: searchParams.get("name") as string } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.recognitionRow.findMany({
      where,
      // 稳定排序：createdAt 不随编辑变化，编辑后行不会跳到列表顶部（避免页面抖动）。
      orderBy: [{ createdAt: "desc" }, { rowIndex: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { document: true, batch: true },
    }),
    prisma.recognitionRow.count({ where }),
  ]);

  return NextResponse.json({ rows, total, page, pageSize });
}
