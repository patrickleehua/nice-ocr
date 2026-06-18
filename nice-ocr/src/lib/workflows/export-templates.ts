import type ExcelJS from "exceljs";
import { getMetaFields, getScenarioFields, isCoreColumn, type FieldDef } from "@/lib/fields/field-schema";

/**
 * 导出模板注册表 + 共享样式引擎。
 *
 * - `standard`：原始 v5 导出的**精确复刻**（列名/顺序/列宽/数字格式与 docs/v5_new_3 2 的 /api/export 一致），
 *   作为默认模板承载「当前流程」。
 * - 其它模板（concise / by-month …）由 field-schema 场景字段驱动，演示「后续扩展」。
 * 字段定义来自 field-schema 单一事实源，识别抽取字段与模板对应；新增模板=往 EXPORT_TEMPLATES 追加一项。
 * 样式对齐 v5：深色表头 + 数字格式 + CJK 自适应列宽 + 冻结首行。
 */

/** 导出时一行的数据来源（核心列在行上，extra 字段在 extraJson，元字段在关联对象/派生）。 */
export interface ExportSourceRow {
  batch: { name: string };
  document: { originalName: string; tag?: string | null };
  rawDate?: string | null;
  normalizedMonth?: string | null;
  code?: string | null;
  name: string;
  unit?: string | null;
  qty: number;
  price: number;
  amount: number;
  remark?: string | null;
  extraJson?: string | null;
  status: string;
  riskLevel: string;
  conflictState?: string | null;
  riskReasonsJson?: string | null;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  sheetName: string;
  filename: string;
  /** 解析该模板的有序列（基于活动场景识别字段 + 元字段）。未来模板可据此随场景扩展。 */
  resolveColumns: (scenarioFields: FieldDef[], metaFields: FieldDef[]) => FieldDef[];
}

/** v5 状态值为中文；nice-ocr 内部为英文枚举，导出时映射回中文以与 v5 输出一致。 */
const STATUS_LABELS: Record<string, string> = {
  confirmed: "已确认",
  pending: "待确认",
  conflict: "冲突",
  excluded: "已排除",
  needs_review: "待复核",
};

/** v5 标准导出的 14 列（精确复刻：键/标签/宽度/数字格式/顺序）。 */
const V5_STANDARD_COLUMNS: FieldDef[] = [
  { key: "document", label: "图片名", type: "text", core: true, editable: false, width: 20 },
  { key: "tag", label: "图片标签", type: "text", core: true, editable: false, width: 12 },
  { key: "rawDate", label: "原始日期", type: "text", core: true, editable: false, width: 14 },
  { key: "normalizedMonth", label: "归一化月份", type: "text", core: true, editable: false, width: 14 },
  { key: "code", label: "商品编码", type: "text", core: true, editable: false, width: 14 },
  { key: "name", label: "商品名", type: "text", core: true, editable: false, width: 20 },
  { key: "unit", label: "单位", type: "text", core: true, editable: false, width: 8 },
  { key: "qty", label: "数量", type: "number", core: true, editable: false, width: 10, numFmt: "#,##0.##", align: "right" },
  { key: "price", label: "单价", type: "number", core: true, editable: false, width: 10, numFmt: "#,##0.00", align: "right" },
  { key: "amount", label: "金额", type: "number", core: true, editable: false, width: 12, numFmt: "#,##0.00", align: "right" },
  { key: "status", label: "状态", type: "text", core: true, editable: false, width: 10 },
  { key: "remark", label: "备注", type: "text", core: true, editable: false, width: 20 },
  { key: "libraryConflict", label: "资料库冲突", type: "text", core: true, editable: false, width: 12 },
  { key: "libraryConflictReason", label: "冲突原因", type: "text", core: true, editable: false, width: 24 },
];

export const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "v5-20260618",
    name: "v5-20260618",
    description: "v5 原版导出（2026-06-18）：14 列，与原工具完全一致。默认模板。",
    sheetName: "识别结果",
    filename: "recognition_result.xlsx",
    resolveColumns: () => V5_STANDARD_COLUMNS,
  },
];

export const DEFAULT_EXPORT_TEMPLATE_ID = "v5-20260618";

export function getExportTemplate(id: string | null | undefined): ExportTemplate {
  return EXPORT_TEMPLATES.find((template) => template.id === id) ?? EXPORT_TEMPLATES[0];
}

export function listExportTemplates() {
  return EXPORT_TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
}

/** 解析模板在当前场景下的列定义。 */
export function resolveTemplateColumns(template: ExportTemplate, scenarioId: string | null): FieldDef[] {
  return template.resolveColumns(getScenarioFields(scenarioId), getMetaFields());
}

/** 取某字段在一行上的导出值：元字段读关联/派生，核心列读列，extra 字段读 extraJson。 */
export function exportCellValue(row: ExportSourceRow, field: FieldDef): string | number {
  switch (field.key) {
    case "batch":
      return row.batch?.name ?? "";
    case "document":
      return row.document?.originalName ?? "";
    case "tag":
      return row.document?.tag ?? "";
    case "status":
      return STATUS_LABELS[row.status] ?? row.status ?? "";
    case "riskLevel":
      return row.riskLevel ?? "";
    case "rawDate":
      return row.rawDate ?? "";
    case "normalizedMonth":
      return row.normalizedMonth ?? "";
    case "libraryConflict":
      return row.conflictState === "open" ? "是" : "";
    case "libraryConflictReason":
      return joinReasons(row.riskReasonsJson);
    default:
      break;
  }
  if (isCoreColumn(field.key)) {
    const value = (row as unknown as Record<string, unknown>)[field.key];
    if (field.type === "number") return Number(value) || 0;
    return value == null ? "" : String(value);
  }
  const extra = safeParseObject(row.extraJson);
  const raw = extra[field.key];
  if (field.type === "number") return Number(raw) || 0;
  return raw == null ? "" : String(raw);
}

function joinReasons(raw?: string | null): string {
  if (!raw) return "";
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.join("；") : "";
  } catch {
    return "";
  }
}

function safeParseObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const cjkWidth = (text: string) =>
  [...text].reduce((sum, char) => sum + (/[一-龥]/.test(char) ? 2 : 1), 0);

/**
 * 把若干行写入一个工作表并套用 v5 风格样式：
 * 深色表头、按字段 numFmt 设数字格式、CJK 感知自适应列宽（上限 40）、冻结首行。
 */
export function writeTemplateSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: FieldDef[],
  rows: ExportSourceRow[],
) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((field) => ({ header: field.label, key: field.key, width: field.width ?? 12 }));

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D3748" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  for (const row of rows) {
    const record: Record<string, string | number> = {};
    for (const field of columns) record[field.key] = exportCellValue(row, field);
    const added = sheet.addRow(record);
    for (const field of columns) {
      if (field.numFmt) added.getCell(field.key).numFmt = field.numFmt;
      if (field.align === "right") added.getCell(field.key).alignment = { horizontal: "right" };
    }
  }

  // CJK 感知自适应列宽
  sheet.columns.forEach((col) => {
    let max = col.header ? cjkWidth(String(col.header)) : 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cjkWidth(String(cell.value ?? ""));
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 40);
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return sheet;
}
