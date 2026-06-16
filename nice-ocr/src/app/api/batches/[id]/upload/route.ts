import { NextResponse } from "next/server";
import { enqueueRecognitionJob } from "@/lib/queue/jobs";
import { prisma } from "@/lib/db/client";
import { storeOriginal } from "@/lib/files/storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const created = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { hash, storedPath } = await storeOriginal(batchId, file.name, buffer);
    const document = await prisma.document.create({
      data: {
        batchId,
        originalName: file.name,
        storedPath,
        hash,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: buffer.byteLength,
        status: "queued",
      },
    });
    await enqueueRecognitionJob(document.id, batchId);
    created.push(document);
  }

  await prisma.batch.update({
    where: { id: batchId },
    data: { status: "processing" },
  });

  return NextResponse.json({ documents: created, queuedJobs: created.length }, { status: 201 });
}
