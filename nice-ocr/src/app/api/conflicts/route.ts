import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") ?? 20)));
  const where = {
    ...(searchParams.get("status") ? { status: searchParams.get("status") as string } : {}),
    ...(searchParams.get("severity") ? { severity: searchParams.get("severity") as string } : {}),
  };

  const [conflicts, total] = await Promise.all([
    prisma.productConflict.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: true },
    }),
    prisma.productConflict.count({ where }),
  ]);
  return NextResponse.json({ conflicts, total, page, pageSize });
}
