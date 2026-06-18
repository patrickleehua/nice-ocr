import { NextResponse } from "next/server";
import { enqueueRecognitionJob } from "@/lib/queue/jobs";
import { prisma } from "@/lib/db/client";
import { storeOriginal } from "@/lib/files/storage";
import { ingestUpload } from "@/lib/files/ingest";
import { enforceRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
// PDF 逐页渲染较耗时，放宽函数执行时长上限。
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(request, "upload", 20, 60_000);
  if (limited) return limited;

  const { id: batchId } = await params;
  const formData = await request.formData();
  const files = formData.getAll("files").filter((item): item is File => item instanceof File);

  if (!files.length) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  // 把每个上传文件展开为图片：图片原样、PDF 逐页渲染、ZIP 解压取其中图片/PDF。
  const images = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      images.push(...(await ingestUpload(file.name, buffer, file.type)));
    } catch (error) {
      return NextResponse.json(
        {
          error: `文件「${file.name}」解析失败：${error instanceof Error ? error.message : String(error)}`,
        },
        { status: 400 },
      );
    }
  }

  if (!images.length) {
    return NextResponse.json(
      { error: "未找到可识别内容。支持：图片（jpg/png/webp 等）、PDF、或包含上述文件的 ZIP 压缩包。" },
      { status: 400 },
    );
  }

  const created = [];
  for (const image of images) {
    const { hash, storedPath } = await storeOriginal(batchId, image.name, image.buffer);
    const document = await prisma.document.create({
      data: {
        batchId,
        originalName: image.name,
        storedPath,
        hash,
        mimeType: image.mimeType || "image/png",
        sizeBytes: image.buffer.byteLength,
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
