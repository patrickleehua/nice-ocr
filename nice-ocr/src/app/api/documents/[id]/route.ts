import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      rows: { where: { deletedAt: null }, orderBy: { rowIndex: "asc" } },
      attempts: { orderBy: { startedAt: "desc" } },
      jobs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ document });
}
