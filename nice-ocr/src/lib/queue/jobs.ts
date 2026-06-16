import { prisma } from "@/lib/db/client";

export async function enqueueRecognitionJob(documentId: string, batchId: string) {
  return prisma.recognitionJob.create({
    data: {
      documentId,
      batchId,
      type: "extract",
      status: "queued",
      maxAttempts: 3,
    },
  });
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
