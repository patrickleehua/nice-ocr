import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { enqueueRecognitionJob } from "@/lib/queue/jobs";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, "retry", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const job = await enqueueRecognitionJob(document.id, document.batchId);
  await prisma.document.update({
    where: { id },
    data: { status: "queued" },
  });
  return NextResponse.json({ job }, { status: 201 });
}
