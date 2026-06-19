import { PassThrough, Readable, type Writable } from "node:stream";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { getActiveScenarioId } from "@/lib/fields/active-scenario";
import {
  DEFAULT_EXPORT_TEMPLATE_ID,
  exportCellValue,
  getExportTemplate,
  resolveTemplateColumns,
  writeTemplateSheet,
  type ExportSourceRow,
  type ExportTemplate,
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

const EXPORT_PAGE_SIZE = 500;

/**
 * 流式导出识别结果：游标分页读库 + exceljs WorkbookWriter 逐行 commit，
 * 内存只驻留一页行 + 当前行，可导出超大数据集而不 OOM。
 * 与 buildRecognitionExport(buffer 版，自适应列宽，供测试/小量场景)不同，
 * 流式下列宽为静态(模板声明值)——自适应需回扫全部行，和流式不兼容。
 *
 * 返回 Web ReadableStream，路由直接 `new Response(stream)` 即可（Next 16 支持）。
 */
export function streamRecognitionExport(
  templateId: string = DEFAULT_EXPORT_TEMPLATE_ID,
  db: DbClient = prisma,
): { stream: ReadableStream<Uint8Array>; template: ExportTemplate } {
  const template = getExportTemplate(templateId);
  const passthrough = new PassThrough();
  // 后台流式写入；任一环节出错则销毁流（客户端收到中断的下载，而非静默截断）。
  void writeStreamingWorkbook(passthrough, template, db).catch((error) => {
    passthrough.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  return { stream: Readable.toWeb(passthrough) as ReadableStream<Uint8Array>, template };
}

async function writeStreamingWorkbook(stream: Writable, template: ExportTemplate, db: DbClient) {
  const scenarioId = await getActiveScenarioId();
  const columns = resolveTemplateColumns(template, scenarioId);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: true });
  // 流式 WorksheetWriter 的 views 为只读 getter，冻结首行须经 addWorksheet 选项传入。
  const sheet = workbook.addWorksheet(template.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((field) => ({ header: field.label, key: field.key, width: field.width ?? 12 }));

  // 表头样式：流式下提交首行后不可改，必须在写数据行前设置并提交。
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D3748" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.commit();

  // 游标分页：每次只取一页，避免一次性把所有行装入内存。
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.recognitionRow.findMany({
      where: { deletedAt: null },
      include: { document: true, batch: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: EXPORT_PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const record: Record<string, string | number> = {};
      for (const field of columns) record[field.key] = exportCellValue(row as unknown as ExportSourceRow, field);
      const added = sheet.addRow(record);
      for (const field of columns) {
        if (field.numFmt) added.getCell(field.key).numFmt = field.numFmt;
        if (field.align === "right") added.getCell(field.key).alignment = { horizontal: "right" };
      }
      added.commit();
    }
    if (rows.length < EXPORT_PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }

  await sheet.commit();
  await workbook.commit();
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
