import { NextResponse } from "next/server";
import { resolveProductConflict } from "@/lib/workflows/conflicts";

export const runtime = "nodejs";

/**
 * 处理产品库冲突：标记为已解决或忽略。
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const conflict = await resolveProductConflict(id, { status: body.status, note: body.note });

  if (!conflict) {
    return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  }
  return NextResponse.json({ conflict });
}
