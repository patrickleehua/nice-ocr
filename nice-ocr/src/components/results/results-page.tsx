"use client";

import { Download, Edit3, Filter, MoreHorizontal, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { recognitionRows } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { EditRowDrawer } from "@/components/dialogs/action-dialogs";
import { apiGet, apiJson } from "@/lib/api/client";
import type { RecognitionRow, RiskLevel, RowStatus } from "@/lib/types";

type ApiRecognitionRow = {
  id: string;
  batchId: string;
  documentId: string;
  normalizedMonth?: string | null;
  code?: string | null;
  name: string;
  unit?: string | null;
  qty: number;
  price: number;
  amount: number;
  remark?: string | null;
  riskLevel: string;
  status: string;
  conflictState?: string | null;
  riskReasonsJson?: string | null;
  updatedAt: string;
  batch?: { name: string };
  document?: { originalName: string };
};

function toRecognitionRow(row: ApiRecognitionRow): RecognitionRow {
  return {
    id: row.id,
    batchId: row.batchId,
    batchName: row.batch?.name ?? row.batchId,
    documentId: row.documentId,
    documentName: row.document?.originalName ?? row.documentId,
    month: row.normalizedMonth ?? "",
    code: row.code ?? "",
    name: row.name,
    unit: row.unit ?? "",
    qty: Number(row.qty) || 0,
    price: Number(row.price) || 0,
    amount: Number(row.amount) || 0,
    risk: row.riskLevel as RiskLevel,
    status: row.status as RowStatus,
    conflictReason:
      row.conflictState && row.conflictState !== "none"
        ? JSON.parse(row.riskReasonsJson || "[]").join("、")
        : undefined,
    remark: row.remark ?? "",
    updatedAt: row.updatedAt,
  };
}

export function ResultsPage() {
  const [editing, setEditing] = useState<RecognitionRow | undefined>();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ rows: ApiRecognitionRow[] }>({
    queryKey: ["rows"],
    queryFn: () => apiGet("/api/rows"),
  });
  const rows = data?.rows?.map(toRecognitionRow) ?? recognitionRows;
  const updateRow = useMutation({
    mutationFn: (payload: Partial<RecognitionRow>) =>
      apiJson(`/api/rows/${editing?.id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setEditing(undefined);
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">全部结果</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看、筛选、编辑、确认所有识别明细行。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary"><RotateCcw size={15} />重建产品库</Button>
          <Button size="sm" variant="primary"><Download size={15} />导出</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm"><option>全部批次</option></select>
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm"><option>全部文档</option></select>
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm"><option>2024年6月</option></select>
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm"><option>待审核</option></select>
          <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm"><option>风险：全部</option></select>
          <input className="h-9 w-56 rounded-md border border-border px-3 text-sm" placeholder="产品编码/名称" />
          <Button size="sm" variant="secondary"><Filter size={15} />筛选</Button>
        </div>
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>行号</th>
              <th className={tableCellClass}>批次</th>
              <th className={tableCellClass}>文档</th>
              <th className={tableCellClass}>月份</th>
              <th className={tableCellClass}>产品编码</th>
              <th className={tableCellClass}>产品名称</th>
              <th className={tableCellClass}>单位</th>
              <th className={tableCellClass}>数量</th>
              <th className={tableCellClass}>单价</th>
              <th className={tableCellClass}>金额</th>
              <th className={tableCellClass}>风险</th>
              <th className={tableCellClass}>状态</th>
              <th className={tableCellClass}>冲突原因</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="hover:bg-muted/70">
                <td className={tableCellClass}>{index + 1}</td>
                <td className={tableCellClass}>{row.batchName}</td>
                <td className={tableCellClass}>{row.documentName}</td>
                <td className={tableCellClass}>{row.month}</td>
                <td className={tableCellClass}>{row.code || "-"}</td>
                <td className={tableCellClass}>{row.name}</td>
                <td className={tableCellClass}>{row.unit || "-"}</td>
                <td className={tableCellClass}>{row.qty.toFixed(2)}</td>
                <td className={tableCellClass}>{formatCurrency(row.price)}</td>
                <td className={tableCellClass}>{formatCurrency(row.amount)}</td>
                <td className={tableCellClass}><RiskBadge risk={row.risk} /></td>
                <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                <td className={tableCellClass}>{row.conflictReason ?? "-"}</td>
                <td className={tableCellClass}>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="编辑行" onClick={() => setEditing(row)}><Edit3 size={15} /></Button>
                    <Button size="icon" variant="ghost" aria-label="更多操作"><MoreHorizontal size={15} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>共 1,532 条，当前显示 50 条</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((page) => (
              <button key={page} className="h-7 min-w-7 rounded border border-border bg-surface px-2 hover:bg-muted">
                {page}
              </button>
            ))}
          </div>
        </div>
      </TableWrap>
      <EditRowDrawer
        row={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(undefined)}
        onSubmit={(payload) => updateRow.mutate(payload)}
      />
    </div>
  );
}
