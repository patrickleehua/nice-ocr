import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const onlyLowRisk = body.onlyLowRisk !== false;
  const result = await prisma.recognitionRow.updateMany({
    where: {
      deletedAt: null,
      ...(body.batchId ? { batchId: String(body.batchId) } : {}),
      ...(onlyLowRisk ? { riskLevel: "low" } : {}),
    },
    data: { status: "confirmed" },
  });
  return NextResponse.json({ updated: result.count });
}
