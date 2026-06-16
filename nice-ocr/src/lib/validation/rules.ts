import type { RecognitionRow } from "@/lib/types";

const invalidNameWords = [
  "合计",
  "总计",
  "小计",
  "备注",
  "单位",
  "数量",
  "单价",
  "金额",
  "日期",
  "电话",
  "地址",
  "经手人",
  "制单人",
  "采购单",
  "销售单",
  "页码",
  "品名",
  "商品名",
  "编号",
  "编码",
  "规格",
  "客户",
  "供货商",
  "供应商",
  "审核",
  "签字",
  "合 计",
];

export function normalizeMonth(value?: string | null) {
  if (!value) return "";
  const text = String(value).trim();
  const cn = text.match(/(\d{4})年(\d{1,2})/);
  if (cn) return `${cn[1]}年${Number(cn[2])}月`;
  const sep = text.match(/(\d{4})[.\-/](\d{1,2})/);
  if (sep) return `${sep[1]}年${Number(sep[2])}月`;
  return "";
}

export function cleanProductCode(code?: string | null) {
  const value = String(code ?? "").trim();
  if (/^\d{4,5}$/.test(value)) return "";
  return value;
}

export function isInvalidProductName(name?: string | null) {
  const value = String(name ?? "").trim();
  if (!value) return true;
  if (/^[\d\s\-—_.,，。:：/\\|]+$/.test(value)) return true;
  if (value.length > 28 && /(地址|电话|公司|门店|备注|说明|合计|总计)/.test(value)) return true;
  return invalidNameWords.some((word) => value === word || value.includes(word));
}

export function validateRow(row: Pick<RecognitionRow, "code" | "name" | "qty" | "price" | "amount">) {
  const reasons: string[] = [];
  const cleanCode = cleanProductCode(row.code);

  if (row.code && row.code !== cleanCode) reasons.push("CODE_CLEANED_BY_RULE");
  if (isInvalidProductName(row.name)) reasons.push("INVALID_PRODUCT_NAME");

  const expected = Number(row.qty || 0) * Number(row.price || 0);
  if (Math.abs(expected - Number(row.amount || 0)) > 0.01) reasons.push("AMOUNT_MISMATCH");

  const riskLevel = reasons.some((reason) => reason === "INVALID_PRODUCT_NAME")
    ? "high"
    : reasons.length
      ? "medium"
      : "low";

  return { riskLevel, reasons, cleanCode };
}
