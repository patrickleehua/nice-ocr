import "dotenv/config";

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import {
  createRecognitionProvider,
  resolveProviderPrompts,
  type RecognitionProvider,
  type RecognitionProviderResult,
} from "@/lib/recognition/provider";
import { resolveRecognitionProviders } from "@/lib/recognition/settings";
import { claimNextJob } from "@/lib/queue/jobs";
import { validateRow } from "@/lib/validation/rules";
import {
  buildConsensusFlags,
  decideRowReview,
  normalizeApprovalMode,
  requiresConsensus,
} from "@/lib/recognition/review";

const workerId = `worker-${process.pid}`;

type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claimNextJob>>>;

async function recordAttempt(
  job: ClaimedJob,
  result: RecognitionProviderResult,
  pass: number,
  startedAt: number,
) {
  const attemptDir = path.join(env.storageDir, "attempts", job.documentId);
  await mkdir(attemptDir, { recursive: true });
  const rawOutputPath = path.join(attemptDir, `${job.id}-pass${pass}.json`);
  await writeFile(rawOutputPath, JSON.stringify(result.rawResponse, null, 2), "utf8");

  return prisma.extractionAttempt.create({
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
      validationJson: JSON.stringify({ normalizedMonth: result.extraction.normalizedMonth, pass }),
      tokenUsageJson: result.tokenUsage ? JSON.stringify(result.tokenUsage) : undefined,
      latencyMs: Date.now() - startedAt,
      completedAt: new Date(),
    },
  });
}

async function recognizePass(provider: RecognitionProvider, job: ClaimedJob, imageBase64: string, pass: number) {
  const startedAt = Date.now();
  const result = await provider.recognize({ imageBase64, mimeType: job.document.mimeType });
  const attempt = await recordAttempt(job, result, pass, startedAt);
  return { result, attempt };
}

async function processOne() {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  try {
    const imageBase64 = (await readFile(job.document.storedPath)).toString("base64");
    const mode = normalizeApprovalMode(job.batch.approvalMode);

    // 双模型交叉验证：pass1 主模型、pass2 副模型（提示词按 provider 覆盖，回退全局默认）。
    const { primary, secondary, defaults } = await resolveRecognitionProviders(job.batch);
    const primaryProvider = createRecognitionProvider(primary, resolveProviderPrompts(primary, defaults));

    // 第一次识别（canonical 结果，主模型）。
    const first = await recognizePass(primaryProvider, job, imageBase64, 1);
    const canonicalRows = first.result.extraction.rows;

    // hybrid / auto 需要第二次识别做一致性比对（副模型，缺省时退化为主模型）。
    let consensusFlags = canonicalRows.map(() => false);
    if (requiresConsensus(mode)) {
      const secondaryProvider =
        secondary.id === primary.id
          ? primaryProvider
          : createRecognitionProvider(secondary, resolveProviderPrompts(secondary, defaults));
      const second = await recognizePass(secondaryProvider, job, imageBase64, 2);
      consensusFlags = buildConsensusFlags(canonicalRows, second.result.extraction.rows);
    }

    await prisma.recognitionRow.deleteMany({
      where: { documentId: job.documentId, status: { not: "confirmed" } },
    });

    let hasHighRisk = false;
    let autoApproved = 0;
    for (const [index, row] of canonicalRows.entries()) {
      const validation = validateRow(row);
      const decision = decideRowReview(mode, validation.riskLevel, consensusFlags[index] ?? false);
      if (validation.riskLevel === "high") hasHighRisk = true;
      if (decision.reviewClass === "ai_auto") autoApproved += 1;

      await prisma.recognitionRow.create({
        data: {
          batchId: job.batchId,
          documentId: job.documentId,
          canonicalAttemptId: first.attempt.id,
          rowIndex: index + 1,
          rawDate: first.result.extraction.rawDate,
          normalizedMonth: first.result.extraction.normalizedMonth,
          code: validation.cleanCode,
          name: row.name,
          unit: row.unit,
          qty: row.qty,
          price: row.price,
          amount: row.amount,
          remark: row.remark,
          status: decision.status,
          reviewClass: decision.reviewClass,
          riskLevel: validation.riskLevel,
          riskReasonsJson: JSON.stringify(validation.reasons),
          conflictState: validation.reasons.length ? "open" : "none",
        },
      });
    }

    await prisma.document.update({
      where: { id: job.documentId },
      data: {
        status: "extracted",
        reviewStatus: autoApproved === canonicalRows.length && canonicalRows.length > 0 ? "auto_approved" : "pending",
        riskLevel: hasHighRisk ? "high" : "low",
      },
    });

    await prisma.recognitionJob.update({
      where: { id: job.id },
      data: { status: "completed", lockedAt: null, lockedBy: null },
    });

    console.log(
      `${workerId} done doc=${job.documentId} mode=${mode} primary=${primary.providerKey} secondary=${secondary.providerKey} rows=${canonicalRows.length} auto=${autoApproved}`,
    );
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
    console.error(`${workerId} failed job=${job.id}: ${message}`);
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
