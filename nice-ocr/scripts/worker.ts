import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { OpenAICompatibleProvider } from "@/lib/recognition/provider";
import { claimNextJob, enqueueSecondPassIfNeeded } from "@/lib/queue/jobs";
import { validateRow } from "@/lib/validation/rules";

const workerId = `worker-${process.pid}`;
const provider = new OpenAICompatibleProvider();

async function processOne() {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  const startedAt = new Date();
  try {
    const imageBuffer = await readFile(job.document.storedPath);
    const result = await provider.recognize({
      imageBase64: imageBuffer.toString("base64"),
      mimeType: job.document.mimeType,
    });

    const attemptDir = path.join(env.storageDir, "attempts", job.documentId);
    await mkdir(attemptDir, { recursive: true });
    const rawOutputPath = path.join(attemptDir, `${job.id}.json`);
    await writeFile(rawOutputPath, JSON.stringify(result, null, 2), "utf8");

    const attempt = await prisma.extractionAttempt.create({
      data: {
        documentId: job.documentId,
        jobId: job.id,
        providerKey: provider.key,
        model: env.openaiModel,
        promptVersion: "v1",
        schemaVersion: "v1",
        strategy: job.batch.strategy,
        status: "completed",
        rawOutputPath,
        parsedJson: JSON.stringify(result),
        validationJson: JSON.stringify({ normalizedMonth: result.normalizedMonth }),
        latencyMs: Date.now() - startedAt.getTime(),
        completedAt: new Date(),
      },
    });

    await prisma.recognitionRow.deleteMany({
      where: { documentId: job.documentId, status: { not: "confirmed" } },
    });

    for (const [index, row] of result.rows.entries()) {
      const validation = validateRow(row);
      await prisma.recognitionRow.create({
        data: {
          batchId: job.batchId,
          documentId: job.documentId,
          canonicalAttemptId: attempt.id,
          rowIndex: index + 1,
          rawDate: result.rawDate,
          normalizedMonth: result.normalizedMonth,
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

    const hasHighRisk = result.rows.some((row) => validateRow(row).riskLevel === "high");
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
