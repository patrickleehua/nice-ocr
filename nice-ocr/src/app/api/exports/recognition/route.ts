import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST() {
  const rows = await prisma.recognitionRow.findMany({
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

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="recognition-result.xlsx"',
    },
  });
}
