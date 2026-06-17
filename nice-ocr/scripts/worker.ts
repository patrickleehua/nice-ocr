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
import {
  auditRowByRules,
  buildAuditStats,
  findDuplicateRowIds,
  type AuditableRow,
} from "@/lib/recognition/audit";

const workerId = `worker-${process.pid}`;

type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claimNextJob>>>;

async function recordAttempt(
  job: ClaimedJob,
  result: RecognitionProviderResult,
  pass: number,
  startedAt: number,
  strategy = job.batch.strategy,
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
      strategy,
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

async function recognizePass(provider: RecognitionProvider, job: ClaimedJob, imageBase64: string, pass: number, strategy?: string) {
  const startedAt = Date.now();
  const result = await provider.recognize({ imageBase64, mimeType: job.document.mimeType });
  const attempt = await recordAttempt(job, result, pass, startedAt, strategy);
  return { result, attempt };
}

// ---------- 识别(extract / second_pass / consensus) ----------

async function extractDocument(job: ClaimedJob) {
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

  console.log(
    `${workerId} done doc=${job.documentId} mode=${mode} primary=${primary.providerKey} secondary=${secondary.providerKey} rows=${canonicalRows.length} auto=${autoApproved}`,
  );
}

// ---------- 审核(audit) ：对 ai_auto 行二次复查 ----------

const reasonLabels: Record<string, string> = {
  RULE_VIOLATION: "规则校验异常",
  PRICE_OUTLIER: "单价偏离历史",
  UNIT_MISMATCH: "单位与历史不一致",
  DUPLICATE_ROW: "文档内重复行",
  AI_DISAGREE: "第三次识别不一致",
};

function toAuditable(row: { id: string; code: string | null; name: string; unit: string | null; qty: number; price: number; amount: number }): AuditableRow {
  return { id: row.id, code: row.code, name: row.name, unit: row.unit, qty: row.qty, price: row.price, amount: row.amount };
}

async function auditDocument(job: ClaimedJob) {
  // 仅复查"机器自动通过(ai_auto)"且已确认的行——唯一无人复核的盲区。
  const aiAutoRows = await prisma.recognitionRow.findMany({
    where: { documentId: job.documentId, reviewClass: "ai_auto", status: "confirmed", deletedAt: null },
    orderBy: { rowIndex: "asc" },
  });

  if (!aiAutoRows.length) {
    console.log(`${workerId} audit doc=${job.documentId} aiAuto=0 flagged=0 (skip)`);
    return;
  }

  const { primary, secondary, defaults } = await resolveRecognitionProviders(job.batch);

  // Stage 1：规则/统计预筛（零 API）。历史基线取所有已确认行（含单价，ProductObservation 不存价）。
  const history = await prisma.recognitionRow.findMany({
    where: { status: "confirmed", deletedAt: null },
    select: { code: true, name: true, unit: true, qty: true, price: true, amount: true },
  });
  const stats = buildAuditStats(history.map((row) => ({ ...row })));
  const auditables = aiAutoRows.map(toAuditable);
  const duplicateIds = findDuplicateRowIds(auditables);

  const reasonsByRow = new Map<string, string[]>();
  for (const row of auditables) {
    const { reasons } = auditRowByRules(row, stats, { priceOutlierRatio: 3, minHistory: 3 });
    const list = [...reasons];
    if (duplicateIds.has(row.id as string)) list.push("DUPLICATE_ROW");
    reasonsByRow.set(row.id as string, list);
  }

  const stage1Suspicious = auditables.some((row) => (reasonsByRow.get(row.id as string) ?? []).length > 0);

  // Stage 2：第三次独立 AI 交叉验证。可疑文档必跑；干净文档按抽样率跑（成本可控）。
  const sampleRate = Math.min(1, Math.max(0, defaults.auditSampleRate ?? 0.1));
  const runStage2 = stage1Suspicious || Math.random() < sampleRate;

  let stage2 = false;
  const suggestionByRow = new Map<string, AuditableRow>();
  if (runStage2) {
    try {
      const auditProvider = await resolveAuditProvider(primary, secondary, defaults.auditProviderKey);
      const imageBase64 = (await readFile(job.document.storedPath)).toString("base64");
      const pass = await recognizePass(
        createRecognitionProvider(auditProvider, resolveProviderPrompts(auditProvider, defaults)),
        job,
        imageBase64,
        3,
        "audit",
      );
      const auditRows = pass.result.extraction.rows;
      // 第三次是否复现了每个 ai_auto 行；未复现 → 不一致。
      const reproduced = buildConsensusFlags(auditables, auditRows);
      auditables.forEach((row, index) => {
        if (!reproduced[index]) {
          reasonsByRow.get(row.id as string)?.push("AI_DISAGREE");
          // 建议值：第三次中同名（去空白）的行。
          const match = auditRows.find((other) => normalize(other.name) === normalize(row.name));
          if (match) {
            suggestionByRow.set(row.id as string, {
              code: match.code ?? null,
              name: match.name,
              unit: match.unit ?? null,
              qty: match.qty,
              price: match.price,
              amount: match.amount,
            });
          }
        }
      });
      stage2 = true;
    } catch (error) {
      // 无可用审核 provider 或调用失败 → 仅用 Stage1 结果，不让审核任务失败。
      console.warn(`${workerId} audit doc=${job.documentId} stage2 skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let flagged = 0;
  for (const row of auditables) {
    const reasons = reasonsByRow.get(row.id as string) ?? [];
    const isFlagged = reasons.length > 0;
    if (isFlagged) flagged += 1;
    const suggestion = suggestionByRow.get(row.id as string);
    await prisma.recognitionRow.update({
      where: { id: row.id as string },
      data: {
        auditState: isFlagged ? "flagged" : "passed",
        auditNote: isFlagged ? reasons.map((reason) => reasonLabels[reason] ?? reason).join("、") : null,
        auditSuggestionJson: suggestion ? JSON.stringify(suggestion) : null,
        auditedAt: new Date(),
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      entityType: "Document",
      entityId: job.documentId,
      action: "audit",
      afterJson: JSON.stringify({ aiAuto: auditables.length, flagged, stage2 }),
    },
  });

  console.log(
    `${workerId} audit doc=${job.documentId} aiAuto=${auditables.length} flagged=${flagged} stage2=${stage2}`,
  );
}

async function resolveAuditProvider(
  primary: Awaited<ReturnType<typeof resolveRecognitionProviders>>["primary"],
  secondary: Awaited<ReturnType<typeof resolveRecognitionProviders>>["secondary"],
  auditProviderKey: string | null,
) {
  if (auditProviderKey) {
    const config = await prisma.aiProviderConfig.findUnique({ where: { providerKey: auditProviderKey } });
    if (config && config.enabled && config.apiKey?.trim()) return config;
  }
  // 默认优先选与主模型不同的 provider 以获得独立视角。
  return secondary.id !== primary.id ? secondary : primary;
}

function normalize(name: string): string {
  return String(name ?? "").replace(/\s+/g, "").trim();
}

// ---------- 调度 ----------

async function processOne() {
  const job = await claimNextJob(workerId);
  if (!job) return false;

  try {
    if (job.type === "audit") {
      await auditDocument(job);
    } else {
      await extractDocument(job);
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
    if (job.type !== "audit") {
      await prisma.document.update({
        where: { id: job.documentId },
        data: { status: shouldRetry ? "queued" : "failed" },
      });
    }
    console.error(`${workerId} failed job=${job.id} type=${job.type}: ${message}`);
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
