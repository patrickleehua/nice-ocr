import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";

export const xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function buildRecognitionExport(db: DbClient = prisma) {
  const rows = await db.recognitionRow.findMany({
    where: { deletedAt: null },
    include: { document: true, batch: true },
    orderBy: { updatedAt: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("识别结果");
  sheet.columns = [
    { header: "批次", key: "batch", width: 24 },
    { header: "图片名", key: "document", width: 24 },
    { header: "月份", key: "month", width: 12 },
    { header: "商品编码", key: "code", width: 12 },
    { header: "商品名", key: "name", width: 20 },
    { header: "单位", key: "unit", width: 8 },
    { header: "数量", key: "qty", width: 10 },
    { header: "单价", key: "price", width: 10 },
    { header: "金额", key: "amount", width: 12 },
    { header: "状态", key: "status", width: 10 },
    { header: "风险", key: "risk", width: 10 },
    { header: "备注", key: "remark", width: 20 },
  ];
  rows.forEach((row) => {
    sheet.addRow({
      batch: row.batch.name,
      document: row.document.originalName,
      month: row.normalizedMonth,
      code: row.code,
      name: row.name,
      unit: row.unit,
      qty: row.qty,
      price: row.price,
      amount: row.amount,
      status: row.status,
      risk: row.riskLevel,
      remark: row.remark,
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildProductExport(db: DbClient = prisma) {
  const products = await db.product.findMany({
    include: { conflicts: true },
    orderBy: { updatedAt: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("副食品资料库");
  sheet.columns = [
    { header: "商品编号", key: "code", width: 14 },
    { header: "商品名", key: "name", width: 20 },
    { header: "单位", key: "unit", width: 8 },
    { header: "别名", key: "aliases", width: 20 },
    { header: "是否冲突", key: "conflict", width: 10 },
    { header: "冲突原因", key: "conflictReason", width: 30 },
    { header: "备注", key: "remark", width: 20 },
  ];

  for (const product of products) {
    sheet.addRow({
      code: product.code ?? "",
      name: product.name,
      unit: product.unit ?? "",
      aliases: JSON.parse(product.aliasesJson).join("、"),
      conflict: product.conflicts.some((conflict) => conflict.status === "open") ? "是" : "否",
      conflictReason: product.conflicts.map((conflict) => conflict.reason).join("；"),
      remark: product.remark ?? "",
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
