import { streamRecognitionExport, xlsxContentType } from "@/lib/workflows/exports";
import { DEFAULT_EXPORT_TEMPLATE_ID } from "@/lib/workflows/export-templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const templateId = typeof body?.templateId === "string" ? body.templateId : DEFAULT_EXPORT_TEMPLATE_ID;
  // 流式导出：游标分页 + exceljs WorkbookWriter 逐行 commit，超大结果集也不 OOM。
  const { stream, template } = streamRecognitionExport(templateId);
  return new Response(stream, {
    headers: {
      "content-type": xlsxContentType,
      "content-disposition": `attachment; filename="${template.filename}"`,
    },
  });
}
