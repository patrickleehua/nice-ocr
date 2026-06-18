import { NextResponse } from "next/server";
import { buildRecognitionExport, xlsxContentType } from "@/lib/workflows/exports";
import { DEFAULT_EXPORT_TEMPLATE_ID, getExportTemplate } from "@/lib/workflows/export-templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const templateId = typeof body?.templateId === "string" ? body.templateId : DEFAULT_EXPORT_TEMPLATE_ID;
  const template = getExportTemplate(templateId);
  return new NextResponse(await buildRecognitionExport(template.id), {
    headers: {
      "content-type": xlsxContentType,
      "content-disposition": `attachment; filename="${template.filename}"`,
    },
  });
}
