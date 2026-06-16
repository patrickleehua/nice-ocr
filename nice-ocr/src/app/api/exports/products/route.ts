import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST() {
  const products = await prisma.product.findMany({
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

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="product-library.xlsx"',
    },
  });
}
