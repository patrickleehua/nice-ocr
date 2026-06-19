import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { createRecognitionRow } from "@/lib/workflows/rows";
import { handleRoute, notFound, parseJson } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(async () => {
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
  });
}

const rowCreateSchema = z.object({
  documentId: z.string().min(1, "documentId is required"),
  afterRowId: z.string().nullish(),
  code: z.string().nullish(),
  name: z.string().optional(),
  unit: z.string().nullish(),
  qty: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  remark: z.string().nullish(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await parseJson(request, rowCreateSchema);
    // 新建行 + 重排 rowIndex + 写 AuditLog 放进一个事务，保证原子性。
    const row = await prisma.$transaction((tx) =>
      createRecognitionRow(
        {
          documentId: body.documentId,
          afterRowId: body.afterRowId ?? null,
          code: body.code,
          name: body.name,
          unit: body.unit,
          qty: body.qty,
          price: body.price,
          amount: body.amount,
          remark: body.remark,
          extra: body.extra,
        },
        tx,
      ),
    );

    if (!row) throw notFound("Document not found");
    return NextResponse.json({ row }, { status: 201 });
  });
}
