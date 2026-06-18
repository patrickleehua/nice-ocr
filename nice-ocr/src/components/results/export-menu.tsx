"use client";

import { ChevronDown, Download, FileSpreadsheet } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiDownload, apiGet } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";

interface ExportTemplateInfo {
  id: string;
  name: string;
  description: string;
}

/**
 * 导出按钮。当前仅内置 v5 原版模板 → 直接导出；
 * 注册表新增模板（>1）后自动呈现模板选择下拉，无需改动调用方。
 */
export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<{ templates: ExportTemplateInfo[] }>({
    queryKey: ["export-templates"],
    queryFn: () => apiGet(apiPaths.exportsTemplates),
    staleTime: 10 * 60 * 1000,
  });
  const templates = data?.templates ?? [];
  const multiple = templates.length > 1;

  const exportRows = useMutation({
    mutationFn: (templateId?: string) =>
      apiDownload(apiPaths.exportsRecognition, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(templateId ? { templateId } : {}),
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

  // 单模板：直接导出默认模板。
  if (!multiple) {
    return (
      <Button size="sm" variant="primary" onClick={() => exportRows.mutate(undefined)} disabled={exportRows.isPending}>
        <Download size={15} />
        {exportRows.isPending ? "导出中…" : "导出"}
      </Button>
    );
  }

  // 多模板：导出按钮 + 模板选择下拉。
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
        {exportRows.isPending ? "导出中…" : "导出"}
        <ChevronDown size={14} />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            选择导出模板
          </div>
          {templates.map((template) => (
            <button
              key={template.id}
              role="menuitem"
              onClick={() => exportRows.mutate(template.id)}
              disabled={exportRows.isPending}
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
      ) : null}
    </div>
  );
}
