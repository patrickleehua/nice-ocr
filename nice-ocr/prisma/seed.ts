import "dotenv/config";

import { prisma } from "../src/lib/db/client";

async function main() {
  await prisma.productConflict.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productObservation.deleteMany();
  await prisma.recognitionRow.deleteMany();
  await prisma.extractionAttempt.deleteMany();
  await prisma.recognitionJob.deleteMany();
  await prisma.document.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.aiProviderConfig.deleteMany();
  await prisma.appSetting.deleteMany();

  await prisma.aiProviderConfig.createMany({
    data: [
      {
        providerKey: "openai-responses-default",
        displayName: "OpenAI Responses",
        protocol: "openai_responses",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4.1",
        enabled: false,
        priority: 10,
        maxOutputTokens: 2000,
        metadataJson: JSON.stringify({ notes: "在设置页填入 API Key 后启用" }),
      },
      {
        providerKey: "anthropic-default",
        displayName: "Anthropic Messages",
        protocol: "anthropic_messages",
        baseUrl: "https://api.anthropic.com",
        apiKey: "",
        model: "claude-opus-4-6",
        enabled: false,
        priority: 20,
        maxOutputTokens: 2000,
        metadataJson: JSON.stringify({ notes: "在设置页填入 API Key 后启用" }),
      },
    ],
  });

  await prisma.appSetting.create({
    data: {
      key: "recognition.defaults",
      valueJson: JSON.stringify({
        strategy: "balanced",
        amountTolerance: 0.01,
        queueConcurrency: 3,
        maxAttempts: 3,
        backoffSeconds: 30,
      }),
    },
  });

  const batch = await prisma.batch.create({
    data: {
      name: "2024-06 销售单据批次",
      status: "processing",
      strategy: "balanced",
      notes: "种子数据，用于本地验证界面和 API。",
    },
  });

  const doc = await prisma.document.create({
    data: {
      batchId: batch.id,
      originalName: "单据_20240615_0123.jpg",
      storedPath: "",
      hash: "seed-doc-0123",
      mimeType: "image/jpeg",
      sizeBytes: 0,
      status: "extracted",
      reviewStatus: "pending",
      riskLevel: "medium",
    },
  });

  const rows = [
    ["A1001", "苹果", "kg", 10, 8.5, 85, "low", "[]"],
    ["A1002", "香蕉", "kg", 5, 6, 30, "medium", "[\"NAME_MULTI_UNIT\"]"],
    ["B2001", "牛奶", "箱", 2, 45, 90, "medium", "[\"UNIT_DIFF\"]"],
    ["", "合计", "", 3, 68, 205, "high", "[\"INVALID_PRODUCT_NAME\",\"AMOUNT_MISMATCH\"]"],
  ] as const;

  for (const [index, row] of rows.entries()) {
    await prisma.recognitionRow.create({
      data: {
        batchId: batch.id,
        documentId: doc.id,
        rowIndex: index + 1,
        rawDate: "2024-06-15",
        normalizedMonth: "2024年6月",
        code: row[0],
        name: row[1],
        unit: row[2],
        qty: row[3],
        price: row[4],
        amount: row[5],
        riskLevel: row[6],
        riskReasonsJson: row[7],
        status: row[6] === "high" ? "conflict" : "pending",
        conflictState: row[6] === "low" ? "none" : "open",
      },
    });
  }

  await prisma.product.createMany({
    data: [
      { code: "A1001", name: "苹果", unit: "kg" },
      { code: "A1002", name: "香蕉", unit: "kg" },
      { code: "B2001", name: "牛奶", unit: "箱" },
    ],
  });

  const bad = await prisma.product.create({
    data: { name: "合计", status: "active" },
  });
  await prisma.productConflict.create({
    data: {
      productId: bad.id,
      type: "INVALID_PRODUCT_NAME",
      severity: "high",
      reason: "疑似非商品名",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
