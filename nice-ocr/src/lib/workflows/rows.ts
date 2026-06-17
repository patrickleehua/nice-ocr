import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { validateRow } from "@/lib/validation/rules";

export type RowUpdateInput = {
  code?: string | null;
  name?: string;
  unit?: string | null;
  qty?: number;
  price?: number;
  amount?: number;
  remark?: string | null;
};

export async function updateRecognitionRow(
  id: string,
  input: RowUpdateInput,
  db: DbClient = prisma,
) {
  const before = await db.recognitionRow.findUnique({ where: { id } });
  if (!before) return null;

  const next = {
    code: input.code ?? before.code ?? "",
    name: input.name ?? before.name,
    qty: input.qty ?? before.qty,
    price: input.price ?? before.price,
    amount: input.amount ?? before.amount,
  };
  const validation = validateRow(next);

  const row = await db.recognitionRow.update({
    where: { id },
    data: {
      code: input.code ?? undefined,
      name: input.name ?? undefined,
      unit: input.unit ?? undefined,
      qty: input.qty === undefined ? undefined : Number(input.qty),
      price: input.price === undefined ? undefined : Number(input.price),
      amount: input.amount === undefined ? undefined : Number(input.amount),
      remark: input.remark ?? undefined,
      riskLevel: validation.riskLevel,
      riskReasonsJson: JSON.stringify(validation.reasons),
    },
  });

  await db.auditLog.create({
    data: {
      entityType: "RecognitionRow",
      entityId: id,
      action: "update",
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(row),
    },
  });

  return row;
}

export async function excludeRecognitionRow(id: string, db: DbClient = prisma) {
  return db.recognitionRow.update({
    where: { id },
    data: { deletedAt: new Date(), status: "excluded" },
  });
}
