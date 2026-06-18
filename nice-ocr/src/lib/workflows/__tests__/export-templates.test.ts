import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_EXPORT_TEMPLATE_ID,
  exportCellValue,
  getExportTemplate,
  listExportTemplates,
  resolveTemplateColumns,
  type ExportSourceRow,
} from "../export-templates";
import type { FieldDef } from "@/lib/fields/field-schema";

/** v5 原版导出的 14 列（顺序固定）。 */
const V5_HEADERS = [
  "图片名",
  "图片标签",
  "原始日期",
  "归一化月份",
  "商品编码",
  "商品名",
  "单位",
  "数量",
  "单价",
  "金额",
  "状态",
  "备注",
  "资料库冲突",
  "冲突原因",
];

describe("export templates", () => {
  it("默认模板为 v5-20260618，且仅内置该模板", () => {
    assert.equal(DEFAULT_EXPORT_TEMPLATE_ID, "v5-20260618");
    const list = listExportTemplates();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "v5-20260618");
  });

  it("v5-20260618 的列与 v5 原版完全一致（列名/顺序）", () => {
    const template = getExportTemplate("v5-20260618");
    const columns = resolveTemplateColumns(template, "grocery");
    assert.deepEqual(columns.map((c) => c.label), V5_HEADERS);
    // 数字列带 v5 数字格式
    const qty = columns.find((c) => c.key === "qty");
    const amount = columns.find((c) => c.key === "amount");
    assert.equal(qty?.numFmt, "#,##0.##");
    assert.equal(amount?.numFmt, "#,##0.00");
  });

  it("未知 templateId 回退到默认模板", () => {
    assert.equal(getExportTemplate("does-not-exist").id, "v5-20260618");
  });

  it("exportCellValue 对元/派生字段的取值与 v5 语义一致", () => {
    const row: ExportSourceRow = {
      batch: { name: "B1" },
      document: { originalName: "img.jpg", tag: "T1" },
      rawDate: "2024.06",
      normalizedMonth: "2024年6月",
      code: "A1",
      name: "苹果",
      unit: "箱",
      qty: 2,
      price: 3.5,
      amount: 7,
      remark: "r",
      extraJson: JSON.stringify({ spec: "大包" }),
      status: "confirmed",
      riskLevel: "low",
      conflictState: "open",
      riskReasonsJson: JSON.stringify(["名称异常", "金额不符"]),
    };
    const field = (key: string, type: FieldDef["type"] = "text", core = true): FieldDef => ({
      key,
      label: key,
      type,
      core,
      editable: false,
    });

    assert.equal(exportCellValue(row, field("document")), "img.jpg");
    assert.equal(exportCellValue(row, field("tag")), "T1");
    assert.equal(exportCellValue(row, field("status")), "已确认"); // 英文枚举 → 中文
    assert.equal(exportCellValue(row, field("libraryConflict")), "是"); // conflictState=open
    assert.equal(exportCellValue(row, field("libraryConflictReason")), "名称异常；金额不符");
    assert.equal(exportCellValue(row, field("amount", "number")), 7);
    // 非核心字段从 extraJson 读取
    assert.equal(exportCellValue(row, field("spec", "text", false)), "大包");
  });
});
