import { z } from "zod";
import { buildRecognitionExport, streamRecognitionExport, xlsxContentType, type ExportScope } from "@/lib/workflows/exports";
import { DEFAULT_EXPORT_TEMPLATE_ID, getExportTemplate } from "@/lib/workflows/export-templates";

export const runtime = "nodejs";

/** 选择性导出范围：字段语义与 rows 列表筛选一致；缺省=全库（兼容旧行为）。 */
const scopeSchema = z
  .object({
    batchId: z.string().optional(),
    status: z.string().optional(),
    risk: z.string().optional(),
    auditState: z.string().optional(),
    month: z.string().optional(),
    code: z.string().optional(),
    name: z.string().optional(),
    rowIds: z.array(z.string()).optional(),
  })
  .optional();

const bodySchema = z
  .object({
    templateId: z.string().optional(),
    scope: scopeSchema,
  })
  .partial();

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  const body = parsed.success ? parsed.data : {};
  const templateId = body.templateId ?? DEFAULT_EXPORT_TEMPLATE_ID;
  const scope = body.scope as ExportScope | undefined;
  const template = getExportTemplate(templateId);

  // pivot 多 sheet 透视需全量分组，走 buffer 版；flat 走流式（游标分页，超大结果集不 OOM）。
  if (template.kind === "pivot") {
    const buffer = await buildRecognitionExport(template.id, scope);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": xlsxContentType,
        "content-disposition": `attachment; filename="${template.filename}"`,
      },
    });
  }

  const { stream, template: flat } = streamRecognitionExport(template.id, scope);
  return new Response(stream, {
    headers: {
      "content-type": xlsxContentType,
      "content-disposition": `attachment; filename="${flat.filename}"`,
    },
  });
}
