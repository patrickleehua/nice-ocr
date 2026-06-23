import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";
import { cleanProductCode, isInvalidProductName } from "@/lib/validation/rules";

/** 产品键：有规范编码按编码+名称，否则按名称（与识别一致性比对/审计统计一致）。 */
function productKey(code: string | null | undefined, name: string): string {
  const clean = cleanProductCode(code);
  return clean ? `code:${clean}|name:${name}` : `name:${name}`;
}

/** 正数样本的中位数；无样本返回 null。 */
function median(values: number[]): number | null {
  const nums = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** 出现最多的非空取值；全空返回 null。 */
function dominant(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const text = value?.trim();
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 重建产品库：从已确认行（可选含待确认）沉淀产品观测，再聚合成产品主数据。
 * 每个产品记录名称、**主导单位**（同名多单位取最常见）与**代表单价**（历史成交单价中位数，
 * 取自已确认行 + 导入历史 ProductPriceHistory）。为审核台「按产品名联想单位」与单价/单位校验提供基线。
 */
export async function rebuildProductLibrary(
  options: { includePending?: boolean } = {},
  db: DbClient = prisma,
) {
  const [rows, priceHistory] = await Promise.all([
    db.recognitionRow.findMany({
      where: {
        deletedAt: null,
        ...(options.includePending ? {} : { status: "confirmed" }),
      },
    }),
    db.productPriceHistory.findMany({ select: { code: true, name: true, price: true } }),
  ]);

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

  // 单价样本：已确认行 + 导入历史，按产品键聚合，用于取中位数代表单价。
  const priceByKey = new Map<string, number[]>();
  const addPrice = (code: string | null | undefined, name: string, price: number) => {
    if (!(price > 0)) return;
    const key = productKey(code, name);
    priceByKey.set(key, [...(priceByKey.get(key) ?? []), price]);
  };
  for (const row of rows) addPrice(row.code, row.name, row.price);
  for (const history of priceHistory) addPrice(history.code, history.name, history.price);

  const observations = await db.productObservation.findMany();
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
    const product = await db.product.create({
      data: {
        code: first.cleanCode,
        name: first.name,
        unit: dominant(list.map((item) => item.unit)) ?? first.unit,
        price: median(priceByKey.get(key) ?? []),
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
