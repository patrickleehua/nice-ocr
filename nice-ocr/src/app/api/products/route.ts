import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

function observationKey(code: string | null | undefined, name: string) {
  return code ? `code:${code}|name:${name}` : `name:${name}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const onlyConflicts = searchParams.get("onlyConflicts") === "true";

  const [products, observations] = await Promise.all([
    prisma.product.findMany({
      where: q
        ? {
            OR: [{ name: { contains: q } }, { code: { contains: q } }],
          }
        : {},
      orderBy: [{ updatedAt: "desc" }],
      include: { conflicts: true },
    }),
    prisma.productObservation.findMany({
      select: { cleanCode: true, name: true, documentId: true },
    }),
  ]);

  // 按与产品库重建相同的 key 聚合出现次数与来源文档数。
  const stats = new Map<string, { count: number; docs: Set<string> }>();
  for (const observation of observations) {
    const key = observationKey(observation.cleanCode, observation.name);
    const entry = stats.get(key) ?? { count: 0, docs: new Set<string>() };
    entry.count += 1;
    entry.docs.add(observation.documentId);
    stats.set(key, entry);
  }

  const enriched = products
    .map((product) => {
      const entry = stats.get(observationKey(product.code, product.name));
      return {
        ...product,
        observationCount: entry?.count ?? 0,
        sourceDocuments: entry?.docs.size ?? 0,
      };
    })
    .filter((product) =>
      onlyConflicts ? product.conflicts.some((conflict) => conflict.status === "open") : true,
    );

  return NextResponse.json({ products: enriched });
}
