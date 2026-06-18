import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { getActiveScenarioId } from "@/lib/fields/active-scenario";
import {
  DEFAULT_EXPORT_TEMPLATE_ID,
  getExportTemplate,
  resolveTemplateColumns,
  writeTemplateSheet,
  type ExportSourceRow,
} from "@/lib/workflows/export-templates";

export const xlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * 按选定模板导出识别结果 xlsx。
 * 列由「活动场景字段 + 元字段」经模板解析，样式（深色表头/数字格式/CJK 列宽/冻结首行）由共享引擎套用。
 * 当前仅内置 v5 原版模板；模板系统已就绪，新增模板只需在 export-templates 注册表追加一项。
 */
export async function buildRecognitionExport(
  templateId: string = DEFAULT_EXPORT_TEMPLATE_ID,
  db: DbClient = prisma,
) {
  const rows = await db.recognitionRow.findMany({
    where: { deletedAt: null },
    include: { document: true, batch: true },
    orderBy: [{ createdAt: "desc" }, { rowIndex: "asc" }],
  });
  const scenarioId = await getActiveScenarioId();
  const template = getExportTemplate(templateId);
  const columns = resolveTemplateColumns(template, scenarioId);
  const source = rows as unknown as ExportSourceRow[];

  const workbook = new ExcelJS.Workbook();
  writeTemplateSheet(workbook, template.sheetName, columns, source);
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
