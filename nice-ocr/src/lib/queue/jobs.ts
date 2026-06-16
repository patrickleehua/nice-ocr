import { prisma } from "@/lib/db/client";

export async function enqueueRecognitionJob(
  documentId: string,
  batchId: string,
  type: "extract" | "second_pass" | "consensus" = "extract",
) {
  return prisma.recognitionJob.create({
    data: {
      documentId,
      batchId,
      type,
      status: "queued",
      maxAttempts: 3,
    },
  });
}

export async function enqueueSecondPassIfNeeded(documentId: string, batchId: string) {
  const existing = await prisma.recognitionJob.count({
    where: {
      documentId,
      type: "second_pass",
    },
  });
  if (existing > 0) return null;
  return enqueueRecognitionJob(documentId, batchId, "second_pass");
}

export async function claimNextJob(workerId: string) {
  const job = await prisma.recognitionJob.findFirst({
    where: {
      status: "queued",
      nextRunAt: { lte: new Date() },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (!job) return null;

  return prisma.recognitionJob.update({
    where: { id: job.id },
    data: {
      status: "active",
      lockedAt: new Date(),
      lockedBy: workerId,
      attemptsMade: { increment: 1 },
    },
    include: { document: true, batch: true },
  });
}
