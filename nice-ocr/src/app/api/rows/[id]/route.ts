import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validateRow } from "@/lib/validation/rules";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = await prisma.recognitionRow.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Row not found" }, { status: 404 });

  const body = await request.json();
  const next = {
    code: body.code ?? before.code ?? "",
    name: body.name ?? before.name,
    qty: body.qty ?? before.qty,
    price: body.price ?? before.price,
    amount: body.amount ?? before.amount,
  };
  const validation = validateRow(next);

  const row = await prisma.recognitionRow.update({
    where: { id },
    data: {
      code: body.code ?? undefined,
      name: body.name ?? undefined,
      unit: body.unit ?? undefined,
      qty: body.qty === undefined ? undefined : Number(body.qty),
      price: body.price === undefined ? undefined : Number(body.price),
      amount: body.amount === undefined ? undefined : Number(body.amount),
      remark: body.remark ?? undefined,
      riskLevel: validation.riskLevel,
      riskReasonsJson: JSON.stringify(validation.reasons),
    },
  });

  await prisma.auditLog.create({
    data: {
      entityType: "RecognitionRow",
      entityId: id,
      action: "update",
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(row),
    },
  });

  return NextResponse.json({ row });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.recognitionRow.update({
    where: { id },
    data: { deletedAt: new Date(), status: "excluded" },
  });
  return NextResponse.json({ row });
}
