import { prisma } from "@/lib/db/client";
import type { DbClient } from "@/lib/db/types";

export async function enqueueRecognitionJob(
  documentId: string,
  batchId: string,
  type: "extract" | "second_pass" | "consensus" = "extract",
  db: DbClient = prisma,
) {
  return db.recognitionJob.create({
    data: {
      documentId,
      batchId,
      type,
      status: "queued",
      maxAttempts: 3,
    },
  });
}

export async function enqueueSecondPassIfNeeded(
  documentId: string,
  batchId: string,
  db: DbClient = prisma,
) {
  const existing = await db.recognitionJob.count({
    where: {
      documentId,
      type: "second_pass",
    },
  });
  if (existing > 0) return null;
  return enqueueRecognitionJob(documentId, batchId, "second_pass", db);
}

export async function claimNextJob(workerId: string, db: DbClient = prisma) {
  const job = await db.recognitionJob.findFirst({
    where: {
      status: "queued",
      nextRunAt: { lte: new Date() },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  if (!job) return null;

  return db.recognitionJob.update({
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
