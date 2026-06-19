import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client";
import { enqueueRecognitionJob, enqueueSecondPassIfNeeded, claimNextJob } from "../../queue/jobs";
import { buildProductExport, buildRecognitionExport } from "../exports";
import { getExportTemplate } from "../export-templates";
import { importLegacyRecognitionRows } from "../import-v5";
import { rebuildProductLibrary } from "../products";
import { confirmRecognitionRows, createRecognitionRow, excludeRecognitionRow, updateRecognitionRow } from "../rows";
import { resolveProductConflict } from "../conflicts";
import { buildConsensusFlags, decideRowReview } from "../../recognition/review";
import { resolveProviderPrompts } from "../../recognition/provider";
import { defaultRecognitionPrompts } from "../../recognition/settings";
import { auditRowByRules, buildAuditStats, findDuplicateRowIds } from "../../recognition/audit";

const rollback = Symbol("rollback");

async function withRollback<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    await prisma.$transaction(async (tx) => {
      await callback(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

describe("workflow integration", () => {
  it("imports legacy rows into batch, documents and normalized recognition rows", async () => {
    await withRollback(async (tx) => {
      const result = await importLegacyRecognitionRows(
        [
          {
            image_name: "ticket-a.jpg",
            image_tag: "A",
            raw_date: "2024-06-15",
            code: "1234",
            name: "合计",
            unit: "",
            qty: 2,
            price: 3,
            amount: 9,
          },
          {
            image_name: "ticket-a.jpg",
            raw_date: "2024-06-16",
            code: "A1001",
            name: "苹果",
            unit: "kg",
            qty: 2,
            price: 3,
            amount: 6,
            status: "已确认",
          },
        ],
        tx,
      );

      assert.equal(result.documents, 1);
      assert.equal(result.rows, 2);

      const rows = await tx.recognitionRow.findMany({
        where: { batchId: result.batch.id },
        orderBy: { rowIndex: "asc" },
      });

      assert.equal(rows[0].normalizedMonth, "2024年6月");
      assert.equal(rows[0].riskLevel, "high");
      assert.deepEqual(JSON.parse(rows[0].riskReasonsJson), [
        "CODE_CLEANED_BY_RULE",
        "INVALID_PRODUCT_NAME",
        "AMOUNT_MISMATCH",
      ]);
      assert.equal(rows[1].status, "confirmed");
    });
  });

  it("claims queued jobs and prevents duplicate second-pass jobs", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "queue-test" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "queue.jpg",
          storedPath: "",
          hash: "queue-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });

      const job = await enqueueRecognitionJob(document.id, batch.id, "extract", tx);
      const firstSecondPass = await enqueueSecondPassIfNeeded(document.id, batch.id, tx);
      const duplicateSecondPass = await enqueueSecondPassIfNeeded(document.id, batch.id, tx);
      const claimed = await claimNextJob("worker-test", tx);

      assert.equal(firstSecondPass?.type, "second_pass");
      assert.equal(duplicateSecondPass, null);
      assert.equal(claimed?.id, job.id);
      assert.equal(claimed?.status, "active");
      assert.equal(claimed?.attemptsMade, 1);
      assert.equal(claimed?.lockedBy, "worker-test");
    });
  });

  it("updates rows with audit log and supports soft exclusion", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "row-edit-test" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "row.jpg",
          storedPath: "",
          hash: "row-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });
      const original = await tx.recognitionRow.create({
        data: {
          batchId: batch.id,
          documentId: document.id,
          rowIndex: 1,
          name: "苹果",
          qty: 1,
          price: 2,
          amount: 2,
        },
      });

      const updated = await updateRecognitionRow(
        original.id,
        { name: "合计", qty: 1, price: 2, amount: 3 },
        tx,
      );
      const auditCount = await tx.auditLog.count({
        where: { entityType: "RecognitionRow", entityId: original.id, action: "update" },
      });
      const excluded = await excludeRecognitionRow(original.id, tx);

      assert.equal(updated?.riskLevel, "high");
      assert.deepEqual(JSON.parse(updated?.riskReasonsJson ?? "[]"), [
        "INVALID_PRODUCT_NAME",
        "AMOUNT_MISMATCH",
      ]);
      assert.equal(auditCount, 1);
      assert.equal(excluded?.status, "excluded");
      assert.ok(excluded?.deletedAt);
      // 软删除应留痕 AuditLog(action=exclude)，便于追溯。
      const excludeAuditCount = await tx.auditLog.count({
        where: { entityType: "RecognitionRow", entityId: original.id, action: "exclude" },
      });
      assert.equal(excludeAuditCount, 1);
    });
  });

  it("creates rows with audit log; inline insertion shifts following rows", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "row-create-test" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "create.jpg",
          storedPath: "",
          hash: "row-create-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });
      await tx.recognitionRow.createMany({
        data: [
          { batchId: batch.id, documentId: document.id, rowIndex: 1, name: "苹果" },
          { batchId: batch.id, documentId: document.id, rowIndex: 2, name: "香蕉" },
        ],
      });
      const first = await tx.recognitionRow.findFirst({
        where: { documentId: document.id, rowIndex: 1 },
      });

      // 末尾追加：rowIndex = max + 1 = 3；人工新增标记；金额自洽判低风险
      const appended = await createRecognitionRow(
        { documentId: document.id, name: "橙子", qty: 2, price: 3, amount: 6 },
        tx,
      );
      assert.ok(appended);
      assert.equal(appended.rowIndex, 3);
      assert.equal(appended.reviewClass, "human");
      assert.equal(appended.status, "pending");
      assert.equal(appended.riskLevel, "low");

      // 新建应留痕 AuditLog(action=create)
      const createAuditCount = await tx.auditLog.count({
        where: { entityType: "RecognitionRow", entityId: appended.id, action: "create" },
      });
      assert.equal(createAuditCount, 1);

      // 在第 1 行下方插入：新行 rowIndex=2，原第 2、3 行整体下移到 3、4
      const inserted = await createRecognitionRow(
        { documentId: document.id, afterRowId: first?.id, name: "葡萄" },
        tx,
      );
      assert.ok(inserted);
      assert.equal(inserted.rowIndex, 2);

      const ordered = await tx.recognitionRow.findMany({
        where: { documentId: document.id, deletedAt: null },
        orderBy: { rowIndex: "asc" },
      });
      assert.deepEqual(
        ordered.map((row) => [row.rowIndex, row.name]),
        [
          [1, "苹果"],
          [2, "葡萄"],
          [3, "香蕉"],
          [4, "橙子"],
        ],
      );

      // 非法名称判高风险；文档不存在返回 null
      const flagged = await createRecognitionRow({ documentId: document.id, name: "合计" }, tx);
      assert.equal(flagged?.riskLevel, "high");
      const missing = await createRecognitionRow({ documentId: "nonexistent" }, tx);
      assert.equal(missing, null);
    });
  });

  it("rebuilds product library and exports recognition/product workbooks", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "export-test" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "export.jpg",
          storedPath: "",
          hash: "export-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });
      await tx.recognitionRow.createMany({
        data: [
          {
            batchId: batch.id,
            documentId: document.id,
            rowIndex: 1,
            normalizedMonth: "2024年6月",
            code: "A1001",
            name: "苹果",
            unit: "kg",
            qty: 2,
            price: 3,
            amount: 6,
            status: "confirmed",
          },
          {
            batchId: batch.id,
            documentId: document.id,
            rowIndex: 2,
            normalizedMonth: "2024年6月",
            code: "",
            name: "合计",
            unit: "",
            qty: 1,
            price: 1,
            amount: 1,
            status: "confirmed",
          },
        ],
      });

      const rebuild = await rebuildProductLibrary({}, tx);
      const products = await tx.product.findMany({ include: { conflicts: true } });
      const recognitionWorkbook = await readWorkbook(await buildRecognitionExport(undefined, undefined, tx));
      const productWorkbook = await readWorkbook(await buildProductExport(tx));

      assert.equal(rebuild.products, 2);
      assert.equal(rebuild.conflicts, 1);
      assert.equal(products.some((product) => product.name === "合计" && product.conflicts.length === 1), true);
      assert.equal(recognitionWorkbook.getWorksheet("识别结果")?.rowCount, 3);
      assert.equal(productWorkbook.getWorksheet("副食品资料库")?.rowCount, 3);

      // 选择性导出（M2）：scope 下推 where，按 name 过滤只导出匹配行
      const scopedByName = await readWorkbook(await buildRecognitionExport(undefined, { name: "苹果" }, tx));
      assert.equal(scopedByName.getWorksheet("识别结果")?.rowCount, 2); // 表头 + 苹果 1 行
      // 不存在的 batchId → 空结果（仅表头）
      const scopedEmpty = await readWorkbook(await buildRecognitionExport(undefined, { batchId: "nonexistent" }, tx));
      assert.equal(scopedEmpty.getWorksheet("识别结果")?.rowCount, 1);
    });
  });

  it("批次绑定导出模板并派生抽取场景（M3a）", async () => {
    await withRollback(async (tx) => {
      const template = getExportTemplate("purchase-stats-20260619");
      assert.equal(template.scenarioId, "grocery");
      // 模拟创建逻辑：绑定模板 + 场景由模板派生
      const batch = await tx.batch.create({
        data: { name: "bind", exportTemplateId: template.id, scenarioId: template.scenarioId },
      });
      const read = await tx.batch.findUniqueOrThrow({ where: { id: batch.id } });
      assert.equal(read.exportTemplateId, "purchase-stats-20260619");
      assert.equal(read.scenarioId, "grocery");
    });
  });

  it("confirms only selected rows by rowIds and rejects empty selector", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "confirm-rowids" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "confirm.jpg",
          storedPath: "",
          hash: "confirm-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });
      const high = await tx.recognitionRow.create({
        data: { batchId: batch.id, documentId: document.id, rowIndex: 1, name: "苹果", riskLevel: "high", status: "pending" },
      });
      const low = await tx.recognitionRow.create({
        data: { batchId: batch.id, documentId: document.id, rowIndex: 2, name: "香蕉", riskLevel: "low", status: "pending" },
      });

      // 空选择器不得确认任何行。
      assert.equal(await confirmRecognitionRows({}, tx), null);

      // rowIds 精确确认所选行（即使是高风险）。
      assert.equal(await confirmRecognitionRows({ rowIds: [high.id] }, tx), 1);

      const rows = await tx.recognitionRow.findMany({ where: { batchId: batch.id }, orderBy: { rowIndex: "asc" } });
      assert.equal(rows[0].status, "confirmed");
      assert.equal(rows[0].id, high.id);
      assert.equal(rows[1].status, "pending");
      assert.equal(rows[1].id, low.id);
    });
  });

  it("confirms whole document, and batch selector defaults to low-risk only", async () => {
    await withRollback(async (tx) => {
      const batch = await tx.batch.create({ data: { name: "confirm-scope" } });
      const document = await tx.document.create({
        data: {
          batchId: batch.id,
          originalName: "scope.jpg",
          storedPath: "",
          hash: "scope-hash",
          mimeType: "image/jpeg",
          sizeBytes: 0,
        },
      });
      await tx.recognitionRow.createMany({
        data: [
          { batchId: batch.id, documentId: document.id, rowIndex: 1, name: "苹果", riskLevel: "high", status: "pending" },
          { batchId: batch.id, documentId: document.id, rowIndex: 2, name: "香蕉", riskLevel: "low", status: "pending" },
        ],
      });

      // batchId 默认仅低风险 → 只确认 1 行。
      assert.equal(await confirmRecognitionRows({ batchId: batch.id }, tx), 1);
      const afterBatch = await tx.recognitionRow.findMany({ where: { batchId: batch.id }, orderBy: { rowIndex: "asc" } });
      assert.equal(afterBatch[0].status, "pending");
      assert.equal(afterBatch[1].status, "confirmed");

      // documentId 确认整单（含高风险）。
      assert.equal(await confirmRecognitionRows({ documentId: document.id }, tx), 2);
      const afterDoc = await tx.recognitionRow.findMany({ where: { batchId: batch.id } });
      assert.equal(afterDoc.every((row) => row.status === "confirmed"), true);
    });
  });

  it("resolves a product conflict and returns null for a missing one", async () => {
    await withRollback(async (tx) => {
      const product = await tx.product.create({ data: { name: "合计" } });
      const conflict = await tx.productConflict.create({
        data: { productId: product.id, type: "INVALID_PRODUCT_NAME", severity: "high", reason: "疑似非商品名" },
      });

      const resolved = await resolveProductConflict(conflict.id, { status: "resolved" }, tx);
      assert.equal(resolved?.status, "resolved");
      assert.ok(resolved?.resolvedAt);

      assert.equal(await resolveProductConflict("does-not-exist", {}, tx), null);
    });
  });
});

describe("review decisions", () => {
  it("never auto-approves high risk; mode gates the rest", () => {
    // 高风险任何模式都转冲突。
    assert.deepEqual(decideRowReview("auto", "high", true), { status: "conflict", reviewClass: "conflict" });
    assert.deepEqual(decideRowReview("hybrid", "high", true), { status: "conflict", reviewClass: "conflict" });

    // manual：不自动通过。
    assert.equal(decideRowReview("manual", "low", true).reviewClass, "pending_review");

    // hybrid：低风险 + 双次一致 → 自动通过；缺一不可。
    assert.equal(decideRowReview("hybrid", "low", true).reviewClass, "ai_auto");
    assert.equal(decideRowReview("hybrid", "low", false).reviewClass, "pending_review");
    assert.equal(decideRowReview("hybrid", "medium", true).reviewClass, "pending_review");

    // auto：双次一致即自动通过（含中风险）；不一致转人工。
    assert.equal(decideRowReview("auto", "medium", true).reviewClass, "ai_auto");
    assert.equal(decideRowReview("auto", "low", false).reviewClass, "pending_review");
  });

  it("consensus flags match rows by code/name within tolerance", () => {
    const a = [
      { code: "A1", name: "苹果", qty: 2, price: 3, amount: 6 },
      { code: "", name: "香蕉", qty: 5, price: 6, amount: 30 },
      { code: "", name: "牛奶", qty: 1, price: 9, amount: 9 },
    ];
    const b = [
      { code: "A1", name: "苹果", qty: 2, price: 3, amount: 6 }, // 按编码匹配
      { code: "", name: "香 蕉", qty: 5, price: 6, amount: 30 }, // 按去空白名称匹配
      { code: "", name: "牛奶", qty: 1, price: 8, amount: 8 }, // 单价/金额不一致 → 不匹配
    ];
    assert.deepEqual(buildConsensusFlags(a, b), [true, true, false]);
  });
});

describe("provider prompts", () => {
  it("prefers provider override, then global default, then built-in", () => {
    // provider 覆盖优先。
    assert.deepEqual(
      resolveProviderPrompts(
        { systemPrompt: "S-OVR", userPrompt: "U-OVR" },
        { systemPrompt: "S-G", userPrompt: "U-G" },
      ),
      { systemPrompt: "S-OVR", userPrompt: "U-OVR" },
    );
    // provider 空白/为空 → 回退全局默认。
    assert.deepEqual(
      resolveProviderPrompts({ systemPrompt: "   ", userPrompt: null }, { systemPrompt: "S-G", userPrompt: "U-G" }),
      { systemPrompt: "S-G", userPrompt: "U-G" },
    );
    // provider 与全局都空 → 内置默认。
    assert.deepEqual(resolveProviderPrompts({}, {}), {
      systemPrompt: defaultRecognitionPrompts.systemPrompt,
      userPrompt: defaultRecognitionPrompts.userPrompt,
    });
  });
});

describe("audit rules", () => {
  const history = [
    { name: "苹果", code: "", unit: "斤", qty: 1, price: 5, amount: 5 },
    { name: "苹果", code: "", unit: "斤", qty: 1, price: 5.2, amount: 5.2 },
    { name: "苹果", code: "", unit: "斤", qty: 1, price: 4.8, amount: 4.8 },
  ];

  it("flags price outliers and unit mismatches vs history; clean rows pass", () => {
    const stats = buildAuditStats(history);
    // 正常价/单位 → 不可疑。
    assert.equal(
      auditRowByRules({ name: "苹果", code: "", unit: "斤", qty: 1, price: 5, amount: 5 }, stats).suspicious,
      false,
    );
    // 单价远离历史中位数 → PRICE_OUTLIER。
    const outlier = auditRowByRules({ name: "苹果", code: "", unit: "斤", qty: 1, price: 50, amount: 50 }, stats);
    assert.equal(outlier.suspicious, true);
    assert.ok(outlier.reasons.includes("PRICE_OUTLIER"));
    // 单位与历史主导不一致 → UNIT_MISMATCH。
    const unit = auditRowByRules({ name: "苹果", code: "", unit: "箱", qty: 1, price: 5, amount: 5 }, stats);
    assert.ok(unit.reasons.includes("UNIT_MISMATCH"));
  });

  it("flags rule violations (invalid name / amount mismatch)", () => {
    const bad = auditRowByRules({ name: "合计", code: "", unit: "", qty: 1, price: 2, amount: 99 }, buildAuditStats([]));
    assert.equal(bad.suspicious, true);
    assert.ok(bad.reasons.includes("RULE_VIOLATION"));
  });

  it("detects duplicate rows within a document", () => {
    const dups = findDuplicateRowIds([
      { id: "a", name: "苹果", code: "", unit: "斤", qty: 1, price: 5, amount: 5 },
      { id: "b", name: "苹果", code: "", unit: "斤", qty: 1, price: 5, amount: 5 },
      { id: "c", name: "香蕉", code: "", unit: "斤", qty: 2, price: 3, amount: 6 },
    ]);
    assert.deepEqual([dups.has("a"), dups.has("b"), dups.has("c")], [true, true, false]);
  });
});
