import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { AUDITED_ROW_FIELDS, diffFields } from "@/lib/audit-log";
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
  // 人工确认即视为已复审：把这批中仍为 flagged 的行置 reviewed，使其离开复审队列。
  await db.recognitionRow.updateMany({
    where: { ...where, auditState: "flagged" },
    data: { auditState: "reviewed" },
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
  /** 场景声明的非核心字段，合并进 extraJson（不覆盖未提交的键）。 */
  extra?: Record<string, unknown>;
};

/** 合并 extra patch 到既有 extraJson，返回新的 JSON 字符串；无 patch 时返回 undefined（不更新该列）。 */
function mergeExtraJson(currentJson: string, patch?: Record<string, unknown>): string | undefined {
  if (!patch || Object.keys(patch).length === 0) return undefined;
  let current: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(currentJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed as Record<string, unknown>;
  } catch {
    current = {};
  }
  return JSON.stringify({ ...current, ...patch });
}

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
      extraJson: mergeExtraJson(before.extraJson, input.extra),
      riskLevel: validation.riskLevel,
      riskReasonsJson: JSON.stringify(validation.reasons),
      // 人工编辑待复审行即视为已复审。
      ...(before.auditState === "flagged" ? { auditState: "reviewed" } : {}),
    },
  });

  const diff = diffFields(before, row, AUDITED_ROW_FIELDS);
  await db.auditLog.create({
    data: {
      entityType: "RecognitionRow",
      entityId: id,
      action: "update",
      // 仅记录发生变化的字段的旧/新值（字段级 diff），避免整行噪声膨胀。
      beforeJson: JSON.stringify(diff.before),
      afterJson: JSON.stringify(diff.after),
    },
  });

  return row;
}

/**
 * 软删除（排除）识别行：置 deletedAt + status=excluded，并留痕审计日志。
 * 删除是不可逆操作，与 updateRecognitionRow 一样写 AuditLog 以便追溯。
 * 行不存在（或已删除）时返回 null，调用方应回 404。
 */
export async function excludeRecognitionRow(id: string, db: DbClient = prisma) {
  const before = await db.recognitionRow.findUnique({ where: { id } });
  if (!before || before.deletedAt) return null;

  const row = await db.recognitionRow.update({
    where: { id },
    data: { deletedAt: new Date(), status: "excluded" },
  });

  const diff = diffFields(before, row, AUDITED_ROW_FIELDS);
  await db.auditLog.create({
    data: {
      entityType: "RecognitionRow",
      entityId: id,
      action: "exclude",
      beforeJson: JSON.stringify(diff.before),
      afterJson: JSON.stringify(diff.after),
    },
  });

  return row;
}

export type RowCreateInput = {
  /** 所属文档；新行从该文档继承 batchId。 */
  documentId: string;
  /** 在此行下方插入；缺省则追加到文档末尾。 */
  afterRowId?: string | null;
  code?: string | null;
  name?: string;
  unit?: string | null;
  qty?: number;
  price?: number;
  amount?: number;
  remark?: string | null;
  /** 场景声明的非核心字段，写入 extraJson。 */
  extra?: Record<string, unknown>;
};

/**
 * 人工新建一条识别行（审核台「新增行」）。
 * - documentId 必填，从所属文档继承 batchId；文档不存在返回 null（调用方回 404）。
 * - afterRowId 指定且有效时在该行下方插入：新行 rowIndex = 目标行+1，并把其后行整体下移，
 *   保持 rowIndex 顺序连续（文档详情按 rowIndex 升序展示）；否则追加到末尾（max+1）。
 * - 跑 validateRow 计算 riskLevel/reasons；reviewClass=human、status=pending；写 AuditLog(action=create)。
 */
export async function createRecognitionRow(input: RowCreateInput, db: DbClient = prisma) {
  const document = await db.document.findUnique({ where: { id: input.documentId } });
  if (!document) return null;

  const after = input.afterRowId
    ? await db.recognitionRow.findUnique({ where: { id: input.afterRowId } })
    : null;

  let rowIndex: number;
  if (after && after.documentId === input.documentId && !after.deletedAt) {
    rowIndex = after.rowIndex + 1;
    // 其后行整体下移，给新行让出位置。
    await db.recognitionRow.updateMany({
      where: { documentId: input.documentId, deletedAt: null, rowIndex: { gte: rowIndex } },
      data: { rowIndex: { increment: 1 } },
    });
  } else {
    const max = await db.recognitionRow.aggregate({
      where: { documentId: input.documentId, deletedAt: null },
      _max: { rowIndex: true },
    });
    rowIndex = (max._max.rowIndex ?? 0) + 1;
  }

  const validation = validateRow({
    code: input.code ?? "",
    name: input.name ?? "",
    qty: Number(input.qty ?? 0),
    price: Number(input.price ?? 0),
    amount: Number(input.amount ?? 0),
  });

  const row = await db.recognitionRow.create({
    data: {
      batchId: document.batchId,
      documentId: input.documentId,
      rowIndex,
      code: input.code ?? null,
      name: input.name ?? "",
      unit: input.unit ?? null,
      qty: Number(input.qty ?? 0),
      price: Number(input.price ?? 0),
      amount: Number(input.amount ?? 0),
      remark: input.remark ?? null,
      extraJson: input.extra && Object.keys(input.extra).length ? JSON.stringify(input.extra) : "{}",
      status: "pending",
      reviewClass: "human",
      riskLevel: validation.riskLevel,
      riskReasonsJson: JSON.stringify(validation.reasons),
    },
  });

  await db.auditLog.create({
    data: {
      entityType: "RecognitionRow",
      entityId: row.id,
      action: "create",
      beforeJson: null,
      afterJson: JSON.stringify(row),
    },
  });

  return row;
}
