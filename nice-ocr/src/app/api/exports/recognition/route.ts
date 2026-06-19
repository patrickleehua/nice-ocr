import { buildRecognitionExport, streamRecognitionExport, xlsxContentType } from "@/lib/workflows/exports";
import { DEFAULT_EXPORT_TEMPLATE_ID, getExportTemplate } from "@/lib/workflows/export-templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const templateId = typeof body?.templateId === "string" ? body.templateId : DEFAULT_EXPORT_TEMPLATE_ID;
  const template = getExportTemplate(templateId);

  // pivot 多 sheet 透视需全量分组，走 buffer 版；flat 走流式（游标分页，超大结果集不 OOM）。
  if (template.kind === "pivot") {
    const buffer = await buildRecognitionExport(template.id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": xlsxContentType,
        "content-disposition": `attachment; filename="${template.filename}"`,
      },
    });
  }

  const { stream, template: flat } = streamRecognitionExport(template.id);
  return new Response(stream, {
    headers: {
      "content-type": xlsxContentType,
      "content-disposition": `attachment; filename="${flat.filename}"`,
    },
  });
}
