import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const products = await prisma.product.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
          ],
        }
      : {},
    orderBy: [{ updatedAt: "desc" }],
    include: { conflicts: true },
  });
  return NextResponse.json({ products });
}
