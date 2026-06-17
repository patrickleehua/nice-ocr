import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { validateRow } from "@/lib/validation/rules";

export type ConfirmSelector = {
  rowIds?: string[];
  documentId?: string;
  batchId?: string;
  onlyLowRisk?: boolean;
};

/**
 * 批量确认识别行。按优先级解析选择器：rowIds[] > documentId > batchId。
 * 三者都缺失时返回 null（调用方应回 400），避免空选择误确认全部数据。
 * batchId / documentId 默认仅确认低风险行（onlyLowRisk）；rowIds 精确确认所选行。
 */
export async function confirmRecognitionRows(selector: ConfirmSelector, db: DbClient = prisma) {
  let where: Prisma.RecognitionRowWhereInput;
  if (selector.rowIds && selector.rowIds.length > 0) {
    where = { deletedAt: null, id: { in: selector.rowIds.map(String) } };
  } else if (selector.documentId) {
    where = {
      deletedAt: null,
      documentId: String(selector.documentId),
      ...(selector.onlyLowRisk ? { riskLevel: "low" } : {}),
    };
  } else if (selector.batchId) {
    where = {
      deletedAt: null,
      batchId: String(selector.batchId),
      ...(selector.onlyLowRisk !== false ? { riskLevel: "low" } : {}),
    };
  } else {
    return null;
  }

  const result = await db.recognitionRow.updateMany({
    where,
    data: { status: "confirmed", reviewClass: "human" },
  });
  return result.count;
}

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
