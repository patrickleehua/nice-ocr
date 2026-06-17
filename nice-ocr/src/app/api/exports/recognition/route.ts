import { NextResponse } from "next/server";
import { buildRecognitionExport, xlsxContentType } from "@/lib/workflows/exports";

export const runtime = "nodejs";

export async function POST() {
  return new NextResponse(await buildRecognitionExport(), {
    headers: {
      "content-type": xlsxContentType,
      "content-disposition": 'attachment; filename="recognition-result.xlsx"',
    },
  });
}
