import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { normalizeMonth, validateRow } from "@/lib/validation/rules";

export const runtime = "nodejs";

type LegacyRow = {
  id?: string;
  rowId?: string;
  image_name?: string;
  imageName?: string;
  image?: string;
  image_tag?: string;
  raw_date?: string;
  date?: string;
  normalized_month?: string;
  code?: string;
  name?: string;
  unit?: string;
  qty?: number;
  price?: number;
  amount?: number;
  remark?: string;
  status?: string;
};

async function readJsonArray(formData: FormData, key: string) {
  const file = formData.get(key);
  if (!(file instanceof File)) return [];
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON array`);
  }
  return parsed;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rows = (await readJsonArray(formData, "recognitionResults")) as LegacyRow[];

  const batch = await prisma.batch.create({
    data: {
      name: "v5 历史导入批次",
      notes: "由旧版 recognition-results.json 导入",
      status: "imported",
      strategy: "manual",
    },
  });

  const documentMap = new Map<string, string>();
  let importedRows = 0;

  for (const [index, row] of rows.entries()) {
    const imageName = String(row.image_name ?? row.imageName ?? row.image ?? `unknown_${index + 1}`).trim();
    let documentId = documentMap.get(imageName);

    if (!documentId) {
      const document = await prisma.document.create({
        data: {
          batchId: batch.id,
          originalName: imageName,
          storedPath: "",
          hash: `legacy:${imageName}`,
          mimeType: "image/jpeg",
          sizeBytes: 0,
          status: "extracted",
          reviewStatus: "pending",
          tag: row.image_tag ?? "",
        },
      });
      documentId = document.id;
      documentMap.set(imageName, documentId);
    }

    const validation = validateRow({
      code: row.code ?? "",
      name: row.name ?? "",
      qty: Number(row.qty) || 0,
      price: Number(row.price) || 0,
      amount: Number(row.amount) || 0,
    });

    await prisma.recognitionRow.create({
      data: {
        batchId: batch.id,
        documentId,
        rowIndex: importedRows + 1,
        rawDate: row.raw_date ?? row.date ?? "",
        normalizedMonth: row.normalized_month ?? normalizeMonth(row.raw_date ?? row.date ?? ""),
        code: validation.cleanCode,
        name: row.name ?? "",
        unit: row.unit ?? "",
        qty: Number(row.qty) || 0,
        price: Number(row.price) || 0,
        amount: Number(row.amount) || 0,
        remark: row.remark ?? "",
        status: row.status === "已确认" ? "confirmed" : "pending",
        riskLevel: validation.riskLevel,
        riskReasonsJson: JSON.stringify(validation.reasons),
        conflictState: validation.reasons.length ? "open" : "none",
      },
    });
    importedRows += 1;
  }

  return NextResponse.json({
    batch,
    documents: documentMap.size,
    rows: importedRows,
  });
}
