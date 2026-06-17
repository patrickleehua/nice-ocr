"use client";

import Link from "next/link";
import { Plus, UploadCloud } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BatchStatusBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { CreateBatchDrawer } from "@/components/dialogs/action-dialogs";
import { apiGet, apiJson, apiUpload } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { BatchStatus } from "@/lib/types";

interface ApiBatch {
  id: string;
  name: string;
  status: string;
  strategy: string;
  createdAt: string;
  _count?: { documents: number; rows: number };
}

export function BatchesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery<{ batches: ApiBatch[] }>({
    queryKey: ["batches"],
    queryFn: () => apiGet(apiPaths.batches),
  });

  const createBatch = useMutation({
    mutationFn: (payload: { name: string; strategy: string; notes: string }) =>
      apiJson(apiPaths.batches, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const uploadFiles = useMutation({
    mutationFn: ({ batchId, files }: { batchId: string; files: FileList }) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
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

  const all = data?.batches ?? [];
  const batches = all.filter((batch) => {
    const matchesSearch = search ? batch.name.toLowerCase().includes(search.toLowerCase()) : true;
    const matchesStatus = status ? batch.status === status : true;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          const batchId = uploadTargetRef.current;
          if (files && files.length && batchId) {
            uploadFiles.mutate({ batchId, files });
          }
          event.target.value = "";
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
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="processing">处理中</option>
          <option value="completed">完成</option>
          <option value="failed">失败</option>
        </select>
        {uploadFiles.isPending ? <span className="text-xs text-muted-foreground">上传中...</span> : null}
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>批次名称</th>
              <th className={tableCellClass}>状态</th>
              <th className={tableCellClass}>文档数</th>
              <th className={tableCellClass}>行数</th>
              <th className={tableCellClass}>策略</th>
              <th className={tableCellClass}>创建时间</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.length ? (
              batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-muted/70">
                  <td className={tableCellClass}>
                    <Link href={`/batches/${batch.id}`} className="font-medium text-primary hover:underline">
                      {batch.name}
                    </Link>
                  </td>
                  <td className={tableCellClass}><BatchStatusBadge status={batch.status as BatchStatus} /></td>
                  <td className={tableCellClass}>{formatNumber(batch._count?.documents ?? 0)}</td>
                  <td className={tableCellClass}>{formatNumber(batch._count?.rows ?? 0)}</td>
                  <td className={tableCellClass}>{batch.strategy}</td>
                  <td className={tableCellClass}>{formatDateTime(batch.createdAt)}</td>
                  <td className={tableCellClass}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => triggerUpload(batch.id)}
                      disabled={uploadFiles.isPending}
                    >
                      <UploadCloud size={14} />上传
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={tableCellClass} colSpan={7}>
                  <span className="text-muted-foreground">{isLoading ? "加载中..." : "暂无批次，点击右上角新建批次"}</span>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </TableWrap>
      <CreateBatchDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createBatch.mutate(payload)}
      />
    </div>
  );
}
