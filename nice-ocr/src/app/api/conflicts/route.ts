import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  const conflicts = await prisma.productConflict.findMany({
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    include: { product: true },
  });
  return NextResponse.json({ conflicts });
}
