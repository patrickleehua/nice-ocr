import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { cleanProductCode, isInvalidProductName } from "@/lib/validation/rules";

export async function rebuildProductLibrary(
  options: { includePending?: boolean } = {},
  db: DbClient = prisma,
) {
  const rows = await db.recognitionRow.findMany({
    where: {
      deletedAt: null,
      ...(options.includePending ? {} : { status: "confirmed" }),
    },
  });

  await db.productObservation.deleteMany({});
  await db.productConflict.deleteMany({});
  await db.product.deleteMany({});

  for (const row of rows) {
    await db.productObservation.create({
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

  const observations = await db.productObservation.findMany();
  const productKeys = new Map<string, typeof observations>();
  for (const observation of observations) {
    const key = observation.cleanCode
      ? `code:${observation.cleanCode}|name:${observation.name}`
      : `name:${observation.name}`;
    productKeys.set(key, [...(productKeys.get(key) ?? []), observation]);
  }

  let conflictCount = 0;
  for (const list of productKeys.values()) {
    const first = list[0];
    const product = await db.product.create({
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
      await db.productConflict.create({
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

  return { products: productKeys.size, conflicts: conflictCount };
}
