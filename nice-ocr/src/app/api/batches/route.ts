import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  const batches = await prisma.batch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { documents: true, rows: true, jobs: true },
      },
    },
  });
  return NextResponse.json({ batches });
}

export async function POST(request: Request) {
  const body = await request.json();
  const batch = await prisma.batch.create({
    data: {
      name: String(body.name ?? "未命名批次"),
      notes: body.notes ? String(body.notes) : null,
      strategy: body.strategy ? String(body.strategy) : "balanced",
      status: "draft",
    },
  });
  return NextResponse.json({ batch }, { status: 201 });
}
