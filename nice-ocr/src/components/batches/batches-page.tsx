"use client";

import { ChevronRight, Plus, UploadCloud } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApprovalModeBadge, BatchStatusBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { CreateBatchDrawer, type BatchModelOptionProvider, type CreateBatchPayload } from "@/components/dialogs/action-dialogs";
import { apiGet, apiJson, apiUpload } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { BatchStatus } from "@/lib/types";

interface ApiBatch {
  id: string;
  name: string;
  status: string;
  strategy: string;
  approvalMode: string;
  createdAt: string;
  _count?: { documents: number; rows: number };
  progress?: { total: number; confirmed: number; conflict: number };
}

interface SettingsForBatchCreate {
  defaults: { approvalMode: string; strategy: string };
  providers: BatchModelOptionProvider[];
}

export function BatchesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 20;
  const queryString = (() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    return params.toString();
  })();

  const { data, isLoading } = useQuery<{ batches: ApiBatch[]; total: number }>({
    queryKey: ["batches", queryString],
    queryFn: () => apiGet(`${apiPaths.batches}?${queryString}`),
  });
  const { data: settings } = useQuery<SettingsForBatchCreate>({
    queryKey: ["settings"],
    queryFn: () => apiGet(apiPaths.settings),
  });

  const createBatch = useMutation({
    mutationFn: (payload: CreateBatchPayload) =>
      apiJson(apiPaths.batches, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const uploadFiles = useMutation({
    mutationFn: ({ batchId, files }: { batchId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      return apiUpload(apiPaths.batchUpload(batchId), formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function triggerUpload(batchId: string) {
    uploadTargetRef.current = batchId;
    fileInputRef.current?.click();
  }

  const batches = data?.batches ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf,.zip,application/zip"
        className="hidden"
        onChange={(event) => {
          // 同步把 FileList 快照成 File[]：下面的 value="" 会清空这个「活」FileList，
          // 而 mutation 是异步读取，必须先固化文件引用，否则上传到的是空 FormData。
          const files = event.target.files ? Array.from(event.target.files) : [];
          const batchId = uploadTargetRef.current;
          event.target.value = "";
          if (files.length && batchId) {
            uploadFiles.mutate({ batchId, files });
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">批次管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">按批次维护上传、识别、审核、导出进度。</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} />
          新建批次
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <input
          className="h-9 w-64 rounded-md border border-border px-3 text-sm outline-none focus:border-primary"
          placeholder="搜索批次名称"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="processing">处理中</option>
          <option value="completed">完成</option>
          <option value="failed">失败</option>
        </select>
        {uploadFiles.isPending ? (
          <span className="text-xs text-muted-foreground">上传解析中...</span>
        ) : uploadFiles.isError ? (
          <span className="text-xs text-danger">{(uploadFiles.error as Error)?.message ?? "上传失败"}</span>
        ) : (
          <span className="text-xs text-muted-foreground">支持 图片 / PDF / ZIP 压缩包</span>
        )}
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>批次名称</th>
              <th className={tableCellClass}>状态</th>
              <th className={tableCellClass}>文档数</th>
              <th className={tableCellClass}>行数</th>
              <th className={tableCellClass}>审核进度</th>
              <th className={tableCellClass}>审批模式</th>
              <th className={tableCellClass}>策略</th>
              <th className={tableCellClass}>创建时间</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.length ? (
              batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="cursor-pointer transition-colors hover:bg-muted/70"
                  onClick={() => router.push(`/batches/${batch.id}`)}
                  title="点击查看批次详情与预览"
                >
                  <td className={tableCellClass}>
                    <span className="font-medium text-primary">{batch.name}</span>
                  </td>
                  <td className={tableCellClass}><BatchStatusBadge status={batch.status as BatchStatus} /></td>
                  <td className={tableCellClass}>{formatNumber(batch._count?.documents ?? 0)}</td>
                  <td className={tableCellClass}>{formatNumber(batch._count?.rows ?? 0)}</td>
                  <td className={tableCellClass}><BatchProgressCell progress={batch.progress} /></td>
                  <td className={tableCellClass}><ApprovalModeBadge mode={batch.approvalMode} /></td>
                  <td className={tableCellClass}>{batch.strategy}</td>
                  <td className={tableCellClass}>{formatDateTime(batch.createdAt)}</td>
                  <td className={tableCellClass}>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          triggerUpload(batch.id);
                        }}
                        disabled={uploadFiles.isPending}
                      >
                        <UploadCloud size={14} />上传
                      </Button>
                      <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={tableCellClass} colSpan={9}>
                  <span className="text-muted-foreground">{isLoading ? "加载中..." : "暂无批次，点击右上角新建批次"}</span>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </TableWrap>
      <CreateBatchDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultApprovalMode={settings?.defaults.approvalMode ?? "hybrid"}
        defaultStrategy={settings?.defaults.strategy ?? "balanced"}
        providers={settings?.providers ?? []}
        onSubmit={(payload) => createBatch.mutate(payload)}
      />
    </div>
  );
}

/** 批次审核进度：已确认行 / 总行的小进度条；无行时显示占位符。 */
function BatchProgressCell({ progress }: { progress?: { total: number; confirmed: number; conflict: number } }) {
  const total = progress?.total ?? 0;
  const confirmed = progress?.confirmed ?? 0;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.round((confirmed / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-muted-foreground">
        {formatNumber(confirmed)}/{formatNumber(total)}
      </span>
    </div>
  );
}
