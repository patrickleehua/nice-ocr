"use client";

import Link from "next/link";
import { ChevronLeft, ImageOff, RotateCcw, UploadCloud } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { BatchStatusBadge, RiskBadge } from "@/components/ui/status";
import { SourceBadge } from "@/components/ui/source-badge";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { ExportMenu } from "@/components/results/export-menu";
import { cn, formatDateTime } from "@/lib/utils";
import { apiGet, apiJson, apiUpload } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { BatchStatus, RiskLevel } from "@/lib/types";

interface ApiDoc {
  id: string;
  originalName: string;
  status: string;
  riskLevel: RiskLevel;
  storedPath: string;
  updatedAt: string;
  sourceType: string;
  sourceFile?: string | null;
  sourceEntry?: string | null;
  pageNumber?: number | null;
  pageCount?: number | null;
}

interface BatchDetail {
  batch: {
    id: string;
    name: string;
    status: string;
    exportTemplateId?: string | null;
    scenarioId?: string | null;
    documents: ApiDoc[];
    _count: { documents: number; rows: number };
  };
}

export function BatchDetailPage({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [override, setOverride] = useState<string | null>(null);

  const { data, isLoading } = useQuery<BatchDetail>({
    queryKey: ["batch", batchId],
    queryFn: () => apiGet(apiPaths.batch(batchId)),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["batch", batchId] });
    queryClient.invalidateQueries({ queryKey: ["batches"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const uploadFiles = useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      return apiUpload(apiPaths.batchUpload(batchId), formData);
    },
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: (documentId: string) => apiJson(apiPaths.documentRetry(documentId), { method: "POST" }),
    onSuccess: invalidate,
  });

  const batch = data?.batch;
  const documents = batch?.documents ?? [];
  const selectedId = override ?? documents[0]?.id ?? null;
  const selected = documents.find((doc) => doc.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf,.zip,application/zip"
        className="hidden"
        onChange={(event) => {
          // 同步快照成 File[]，再清空 input；否则异步 mutation 读到的是被 value="" 清空的空 FileList。
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          if (files.length) uploadFiles.mutate(files);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/batches" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <ChevronLeft size={14} />
            返回批次
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{batch?.name ?? (isLoading ? "加载中..." : "批次不存在")}</h1>
            {batch ? <BatchStatusBadge status={batch.status as BatchStatus} /> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <ExportMenu scope={{ batchId }} defaultTemplateId={batch?.exportTemplateId} />
            <Button size="sm" variant="primary" onClick={() => fileInputRef.current?.click()} disabled={uploadFiles.isPending}>
              <UploadCloud size={15} />{uploadFiles.isPending ? "上传解析中..." : "上传文件"}
            </Button>
          </div>
          {uploadFiles.isError ? (
            <span className="text-xs text-danger">{(uploadFiles.error as Error)?.message ?? "上传失败"}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">支持 图片 / PDF / ZIP</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <TableWrap className="min-h-[560px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">文件列表</div>
            <div className="text-xs text-muted-foreground">
              {batch ? `${batch._count.documents} 文档 / ${batch._count.rows} 行` : ""}
            </div>
          </div>
          <DataTable>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>文件名</th>
                <th className={tableCellClass}>来源</th>
                <th className={tableCellClass}>状态</th>
                <th className={tableCellClass}>风险</th>
                <th className={tableCellClass}>更新时间</th>
                <th className={tableCellClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.length ? (
                documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`cursor-pointer hover:bg-muted/70 ${doc.id === selectedId ? "bg-muted/50" : ""}`}
                    onClick={() => setOverride(doc.id)}
                  >
                    <td className={tableCellClass}>{doc.originalName}</td>
                    <td className={cn(tableCellClass, "max-w-[200px]")}>
                      <SourceBadge source={doc} />
                    </td>
                    <td className={tableCellClass}>{doc.status}</td>
                    <td className={tableCellClass}><RiskBadge risk={doc.riskLevel} /></td>
                    <td className={tableCellClass}>{formatDateTime(doc.updatedAt)}</td>
                    <td className={tableCellClass}>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            retry.mutate(doc.id);
                          }}
                          disabled={retry.isPending}
                        >
                          <RotateCcw size={14} />重试
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href="/review" onClick={(event) => event.stopPropagation()}>审核</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className={tableCellClass} colSpan={6}>
                    <span className="text-muted-foreground">{isLoading ? "加载中..." : "暂无文档，请上传文件"}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </TableWrap>

        <Panel>
          <PanelHeader>
            <PanelTitle>{selected?.originalName ?? "单据预览"}</PanelTitle>
          </PanelHeader>
          <div className="p-4">
            <div className="flex h-56 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              {selected?.storedPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={selected.id}
                  src={apiPaths.documentImage(selected.id)}
                  alt={selected.originalName}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff size={24} />
                  <span className="text-xs">原图不可用</span>
                </div>
              )}
            </div>
            {selected ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">来源</dt>
                  <dd className="mt-1"><SourceBadge source={selected} /></dd>
                </div>
                {selected.sourceFile ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">原始文件</dt>
                    <dd className="mt-1 break-all">
                      {selected.sourceFile}
                      {selected.sourceEntry ? <span className="text-muted-foreground"> › {selected.sourceEntry}</span> : null}
                    </dd>
                  </div>
                ) : null}
                <div><dt className="text-xs text-muted-foreground">状态</dt><dd className="mt-1">{selected.status}</dd></div>
                <div><dt className="text-xs text-muted-foreground">风险等级</dt><dd className="mt-1"><RiskBadge risk={selected.riskLevel} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">更新时间</dt><dd className="mt-1">{formatDateTime(selected.updatedAt)}</dd></div>
              </dl>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
