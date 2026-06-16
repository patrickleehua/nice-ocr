import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = await request.json();
  const product = await prisma.product.update({
    where: { id },
    data: {
      code: body.code ?? undefined,
      name: body.name ?? undefined,
      unit: body.unit ?? undefined,
      aliasesJson: body.aliases ? JSON.stringify(body.aliases) : undefined,
      remark: body.remark ?? undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "Product",
      entityId: id,
      action: "update",
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(product),
    },
  });

  return NextResponse.json({ product });
}
