import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { cleanProductCode, isInvalidProductName } from "@/lib/validation/rules";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const includePending = Boolean(body.includePending);
  const rows = await prisma.recognitionRow.findMany({
    where: {
      deletedAt: null,
      ...(includePending ? {} : { status: "confirmed" }),
    },
  });

  await prisma.productObservation.deleteMany({});
  await prisma.productConflict.deleteMany({});
  await prisma.product.deleteMany({});

  for (const row of rows) {
    await prisma.productObservation.create({
      data: {
        rowId: row.id,
        batchId: row.batchId,
        documentId: row.documentId,
        rawCode: row.code,
        cleanCode: cleanProductCode(row.code),
        name: row.name,
        unit: row.unit,
        qty: row.qty,
        normalizedMonth: row.normalizedMonth,
      },
    });
  }

  const observations = await prisma.productObservation.findMany();
  const productKeys = new Map<string, typeof observations>();
  for (const observation of observations) {
    const key = observation.cleanCode
      ? `code:${observation.cleanCode}|name:${observation.name}`
      : `name:${observation.name}`;
    productKeys.set(key, [...(productKeys.get(key) ?? []), observation]);
  }

  let conflictCount = 0;
  for (const [key, list] of productKeys) {
    const first = list[0];
    const product = await prisma.product.create({
      data: {
        code: first.cleanCode,
        name: first.name,
        unit: first.unit,
        firstSeenAt: first.createdAt,
        lastSeenAt: list[list.length - 1].createdAt,
      },
    });

    if (isInvalidProductName(first.name)) {
      conflictCount += 1;
      await prisma.productConflict.create({
        data: {
          productId: product.id,
          type: "INVALID_PRODUCT_NAME",
          severity: "high",
          reason: "疑似非商品名",
          sourceRowIdsJson: JSON.stringify(list.map((item) => item.rowId)),
        },
      });
    }
  }

  return NextResponse.json({ products: productKeys.size, conflicts: conflictCount });
}
