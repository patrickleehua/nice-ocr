"use client";

import { Download, Filter, RotateCcw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuditStateBadge, ReviewClassBadge, RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { EditableCell } from "@/components/ui/editable-cell";
import { formatCurrency } from "@/lib/utils";
import { apiDownload, apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { RecognitionRow, RiskLevel, RowStatus } from "@/lib/types";

interface ApiRecognitionRow {
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
  riskLevel: RiskLevel;
  status: RowStatus;
  reviewClass: string;
  auditState?: string | null;
  auditNote?: string | null;
  conflictState?: string | null;
  riskReasonsJson?: string | null;
  batch?: { name: string };
  document?: { originalName: string };
}

function toRecognitionRow(row: ApiRecognitionRow): RecognitionRow {
  let reasons: string[] = [];
  try {
    reasons = JSON.parse(row.riskReasonsJson || "[]");
  } catch {
    reasons = [];
  }
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
    risk: row.riskLevel,
    status: row.status,
    reviewClass: row.reviewClass ?? "pending_review",
    auditState: row.auditState ?? "none",
    auditNote: row.auditNote ?? undefined,
    conflictReason: reasons.length ? reasons.join("、") : undefined,
    remark: row.remark ?? "",
    updatedAt: "",
  };
}

const PAGE_SIZE = 50;

export function ResultsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: "",
    risk: "",
    audit: searchParams.get("audit") ?? "",
    name: searchParams.get("name") ?? "",
  });

  const queryString = (() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filters.status) params.set("status", filters.status);
    if (filters.risk) params.set("risk", filters.risk);
    if (filters.audit) params.set("auditState", filters.audit);
    if (filters.name) params.set("name", filters.name);
    return params.toString();
  })();

  const { data, isLoading } = useQuery<{ rows: ApiRecognitionRow[]; total: number; page: number }>({
    queryKey: ["rows", queryString],
    queryFn: () => apiGet(`${apiPaths.rows}?${queryString}`),
  });

  const rows = data?.rows?.map(toRecognitionRow) ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["rows"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const updateRow = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiJson(apiPaths.row(id), { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  });
  function commitField(id: string, field: "code" | "name" | "unit" | "qty" | "price" | "amount", raw: string) {
    const numeric = field === "qty" || field === "price" || field === "amount";
    updateRow.mutate({ id, patch: { [field]: numeric ? Number(raw || 0) : raw } });
  }
  const confirmRow = useMutation({
    mutationFn: (id: string) =>
      apiJson(apiPaths.rowsBulkConfirm, { method: "POST", body: JSON.stringify({ rowIds: [id] }) }),
    onSuccess: invalidate,
  });
  const excludeRow = useMutation({
    mutationFn: (id: string) => apiJson(apiPaths.row(id), { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const rebuild = useMutation({
    mutationFn: () => apiJson(apiPaths.productsRebuild, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
  const exportRows = useMutation({ mutationFn: () => apiDownload(apiPaths.exportsRecognition) });

  function patchFilter(patch: Partial<typeof filters>) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">全部结果</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看、筛选、编辑、确认所有识别明细行。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            <RotateCcw size={15} />重建产品库
          </Button>
          <Button size="sm" variant="primary" onClick={() => exportRows.mutate()} disabled={exportRows.isPending}>
            <Download size={15} />导出
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            value={filters.status}
            onChange={(event) => patchFilter({ status: event.target.value })}
          >
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="confirmed">已确认</option>
            <option value="conflict">冲突</option>
            <option value="excluded">已排除</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            value={filters.risk}
            onChange={(event) => patchFilter({ risk: event.target.value })}
          >
            <option value="">风险：全部</option>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
          <select
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            value={filters.audit}
            onChange={(event) => patchFilter({ audit: event.target.value })}
          >
            <option value="">审核：全部</option>
            <option value="flagged">待复审</option>
            <option value="passed">审核通过</option>
            <option value="reviewed">已复审</option>
            <option value="none">未审核</option>
          </select>
          <input
            className="h-9 w-56 rounded-md border border-border px-3 text-sm"
            placeholder="产品编码/名称"
            value={filters.name}
            onChange={(event) => patchFilter({ name: event.target.value })}
          />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Filter size={14} />共 {total} 条
          </span>
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
              <th className={tableCellClass}>标识类别</th>
              <th className={tableCellClass}>审核</th>
              <th className={tableCellClass}>冲突原因</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-muted/70">
                  <td className={tableCellClass}>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className={tableCellClass}>{row.batchName}</td>
                  <td className={tableCellClass}>{row.documentName}</td>
                  <td className={tableCellClass}>{row.month || "-"}</td>
                  <EditableCell
                    value={row.code}
                    format={(value) => (value ? String(value) : "-")}
                    onCommit={(next) => commitField(row.id, "code", next)}
                  />
                  <EditableCell value={row.name} onCommit={(next) => commitField(row.id, "name", next)} />
                  <EditableCell
                    value={row.unit}
                    format={(value) => (value ? String(value) : "-")}
                    onCommit={(next) => commitField(row.id, "unit", next)}
                  />
                  <EditableCell
                    value={row.qty}
                    type="number"
                    align="right"
                    format={(value) => Number(value ?? 0).toFixed(2)}
                    onCommit={(next) => commitField(row.id, "qty", next)}
                  />
                  <EditableCell
                    value={row.price}
                    type="number"
                    align="right"
                    format={(value) => formatCurrency(Number(value ?? 0))}
                    onCommit={(next) => commitField(row.id, "price", next)}
                  />
                  <EditableCell
                    value={row.amount}
                    type="number"
                    align="right"
                    format={(value) => formatCurrency(Number(value ?? 0))}
                    onCommit={(next) => commitField(row.id, "amount", next)}
                  />
                  <td className={tableCellClass}><RiskBadge risk={row.risk} /></td>
                  <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                  <td className={tableCellClass}><ReviewClassBadge value={row.reviewClass} /></td>
                  <td className={tableCellClass}>
                    <span title={row.auditNote ?? undefined}>
                      <AuditStateBadge value={row.auditState ?? "none"} />
                    </span>
                  </td>
                  <td className={tableCellClass}>{row.conflictReason ?? "-"}</td>
                  <td className={tableCellClass}>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => confirmRow.mutate(row.id)}
                        disabled={confirmRow.isPending || row.status === "confirmed"}
                      >
                        确认
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="排除行"
                        onClick={() => excludeRow.mutate(row.id)}
                        disabled={excludeRow.isPending}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={tableCellClass} colSpan={16}>
                  <span className="text-muted-foreground">{isLoading ? "加载中..." : "没有符合条件的记录"}</span>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>共 {total} 条，第 {page} / {totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button
              className="h-7 min-w-7 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              上一页
            </button>
            <button
              className="h-7 min-w-7 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      </TableWrap>
    </div>
  );
}
