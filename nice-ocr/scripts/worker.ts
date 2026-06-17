import "dotenv/config";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createConfiguredRecognitionProvider } from "@/lib/recognition/provider";
import { claimNextJob, enqueueSecondPassIfNeeded } from "@/lib/queue/jobs";
import { validateRow } from "@/lib/validation/rules";

const workerId = `worker-${process.pid}`;

async function processOne() {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  const startedAt = new Date();
  try {
    const provider = await createConfiguredRecognitionProvider();
    const imageBuffer = await readFile(job.document.storedPath);
    const result = await provider.recognize({
      imageBase64: imageBuffer.toString("base64"),
      mimeType: job.document.mimeType,
    });

    const attemptDir = path.join(env.storageDir, "attempts", job.documentId);
    await mkdir(attemptDir, { recursive: true });
    const rawOutputPath = path.join(attemptDir, `${job.id}.json`);
    await writeFile(rawOutputPath, JSON.stringify(result.rawResponse, null, 2), "utf8");

    const attempt = await prisma.extractionAttempt.create({
      data: {
        documentId: job.documentId,
        jobId: job.id,
        providerKey: result.providerKey,
        model: result.model,
        promptVersion: "v1",
        schemaVersion: "v1",
        strategy: job.batch.strategy,
        status: "completed",
        rawOutputPath,
        parsedJson: JSON.stringify(result.extraction),
        validationJson: JSON.stringify({ normalizedMonth: result.extraction.normalizedMonth }),
        tokenUsageJson: result.tokenUsage ? JSON.stringify(result.tokenUsage) : undefined,
        latencyMs: Date.now() - startedAt.getTime(),
        completedAt: new Date(),
      },
    });

    await prisma.recognitionRow.deleteMany({
      where: { documentId: job.documentId, status: { not: "confirmed" } },
    });

    for (const [index, row] of result.extraction.rows.entries()) {
      const validation = validateRow(row);
      await prisma.recognitionRow.create({
        data: {
          batchId: job.batchId,
          documentId: job.documentId,
          canonicalAttemptId: attempt.id,
          rowIndex: index + 1,
          rawDate: result.extraction.rawDate,
          normalizedMonth: result.extraction.normalizedMonth,
          code: validation.cleanCode,
          name: row.name,
          unit: row.unit,
          qty: row.qty,
          price: row.price,
          amount: row.amount,
          remark: row.remark,
          status: validation.riskLevel === "low" ? "pending" : "needs_review",
          riskLevel: validation.riskLevel,
          riskReasonsJson: JSON.stringify(validation.reasons),
          conflictState: validation.reasons.length ? "open" : "none",
        },
      });
    }

    const hasHighRisk = result.extraction.rows.some((row) => validateRow(row).riskLevel === "high");
    await prisma.document.update({
      where: { id: job.documentId },
      data: {
        status: "extracted",
        riskLevel: hasHighRisk ? "high" : "low",
      },
    });

    if (job.batch.strategy === "balanced" && job.type === "extract" && hasHighRisk) {
      await enqueueSecondPassIfNeeded(job.documentId, job.batchId);
    }

    await prisma.recognitionJob.update({
      where: { id: job.id },
      data: { status: "completed", lockedAt: null, lockedBy: null },
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = job.attemptsMade < job.maxAttempts;
    await prisma.recognitionJob.update({
      where: { id: job.id },
      data: {
        status: shouldRetry ? "queued" : "failed",
        lastError: message,
        nextRunAt: new Date(Date.now() + 30_000 * Math.max(1, job.attemptsMade)),
        lockedAt: null,
        lockedBy: null,
      },
    });
    await prisma.document.update({
      where: { id: job.documentId },
      data: { status: shouldRetry ? "queued" : "failed" },
    });
    return true;
  }
}

async function main() {
  console.log(`${workerId} started`);
  while (true) {
    const worked = await processOne();
    if (!worked) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
