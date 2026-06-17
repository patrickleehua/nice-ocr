import { NextResponse } from "next/server";
import { excludeRecognitionRow, updateRecognitionRow } from "@/lib/workflows/rows";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const row = await updateRecognitionRow(id, {
    code: body.code,
    name: body.name,
    unit: body.unit,
    qty: body.qty,
    price: body.price,
    amount: body.amount,
    remark: body.remark,
  });

  if (!row) return NextResponse.json({ error: "Row not found" }, { status: 404 });
  return NextResponse.json({ row });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ row: await excludeRecognitionRow(id) });
}
