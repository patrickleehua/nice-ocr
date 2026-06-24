import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      rows: { where: { deletedAt: null }, orderBy: { rowIndex: "asc" } },
      attempts: { orderBy: { startedAt: "desc" } },
      jobs: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // 副模型逐行候选名（item 1 审核提速）：取最近一次 pass2 识别结果，按行位置映射出"另一个模型读到的名字"，
  // 供审核台作为一键候选展示（数字常一致、名字常分歧，给人快速二选一）。
  let altNames: Array<string | null> = [];
  const secondPass = document.attempts.find((attempt) => {
    try {
      return (JSON.parse(attempt.validationJson ?? "{}") as { pass?: number })?.pass === 2;
    } catch {
      return false;
    }
  });
  if (secondPass?.parsedJson) {
    try {
      const parsed = JSON.parse(secondPass.parsedJson) as { rows?: Array<{ name?: unknown }>; items?: Array<{ name?: unknown }> };
      const list = parsed.rows ?? parsed.items ?? [];
      altNames = list.map((row) => (typeof row?.name === "string" ? row.name : null));
    } catch {
      altNames = [];
    }
  }

  const rows = document.rows.map((row) => {
    const alt = altNames[row.rowIndex - 1] ?? null;
    return { ...row, altName: alt && alt !== row.name ? alt : null };
  });

  return NextResponse.json({ document: { ...document, rows } });
}
