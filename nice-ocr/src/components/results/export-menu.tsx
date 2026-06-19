"use client";

import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiDownload, apiGet } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { ExportScope } from "@/lib/workflows/exports";

interface ExportTemplateInfo {
  id: string;
  name: string;
  description: string;
}

/** 去掉空字符串/空数组字段，只保留生效的范围条件。 */
function normalizeScope(scope?: ExportScope): ExportScope | undefined {
  if (!scope) return undefined;
  const entries = Object.entries(scope).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  return entries.length ? (Object.fromEntries(entries) as ExportScope) : undefined;
}

/**
 * 导出按钮。
 * - `scope`：选择性导出范围（按批次/当前筛选）；缺省=全库。
 * - `defaultTemplateId`：批次绑定的导出模板；存在时主按钮一键直出该模板，多模板仍可下拉切换。
 */
export function ExportMenu({
  scope,
  defaultTemplateId,
}: { scope?: ExportScope; defaultTemplateId?: string | null } = {}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ templates: ExportTemplateInfo[] }>({
    queryKey: ["export-templates"],
    queryFn: () => apiGet(apiPaths.exportsTemplates),
    staleTime: 10 * 60 * 1000,
  });
  const templates = data?.templates ?? [];
  const multiple = templates.length > 1;
  const activeScope = normalizeScope(scope);
  const scoped = Boolean(activeScope);
  const boundTemplate = defaultTemplateId ? templates.find((template) => template.id === defaultTemplateId) : undefined;

  const exportRows = useMutation({
    mutationFn: (templateId?: string) =>
      apiDownload(apiPaths.exportsRecognition, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(templateId ? { templateId } : {}),
          ...(activeScope ? { scope: activeScope } : {}),
        }),
      }),
    onSettled: () => setOpen(false),
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const label = exportRows.isPending ? "导出中…" : "导出";

  // 单模板、或已绑定模板：主按钮一键直出（绑定模板优先）；多模板时附带下拉切换。
  if (!multiple || boundTemplate) {
    const directId = boundTemplate?.id;
    return (
      <div ref={containerRef} className="relative inline-flex items-center gap-1">
        <Button
          size="sm"
          variant="primary"
          onClick={() => exportRows.mutate(directId)}
          disabled={exportRows.isPending}
          title={boundTemplate ? `按绑定模板「${boundTemplate.name}」导出` : undefined}
        >
          <Download size={15} />
          {label}
          {boundTemplate ? <span className="max-w-32 truncate text-xs opacity-90">· {boundTemplate.name}</span> : null}
        </Button>
        {multiple ? (
          <>
            <Button
              size="icon"
              variant="secondary"
              aria-label="切换导出模板"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              disabled={exportRows.isPending}
            >
              <ChevronDown size={14} />
            </Button>
            {open ? <TemplateMenu templates={templates} scoped={scoped} onPick={(id) => exportRows.mutate(id)} pending={exportRows.isPending} /> : null}
          </>
        ) : null}
      </div>
    );
  }

  // 多模板、未绑定：导出按钮 + 模板选择下拉。
  return (
    <div ref={containerRef} className="relative">
      <Button
        size="sm"
        variant="primary"
        onClick={() => setOpen((value) => !value)}
        disabled={exportRows.isPending}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={15} />
        {label}
        <ChevronDown size={14} />
      </Button>
      {open ? <TemplateMenu templates={templates} scoped={scoped} onPick={(id) => exportRows.mutate(id)} pending={exportRows.isPending} /> : null}
    </div>
  );
}

function TemplateMenu({
  templates,
  scoped,
  onPick,
  pending,
}: {
  templates: ExportTemplateInfo[];
  scoped: boolean;
  onPick: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div role="menu" className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-surface p-1 shadow-lg">
      <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">选择导出模板</div>
      <div className="px-2 pb-1.5 text-xs text-muted-foreground">{scoped ? "导出范围：当前筛选 / 批次" : "导出范围：全部结果"}</div>
      {templates.map((template) => (
        <button
          key={template.id}
          role="menuitem"
          onClick={() => onPick(template.id)}
          disabled={pending}
          className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
        >
          <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{template.name}</span>
            <span className="block text-xs text-muted-foreground">{template.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
