"use client";

import { Filter, RotateCcw, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuditStateBadge, ReviewClassBadge, RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { ReasonList } from "@/components/ui/reason-badge";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { FieldCell } from "@/components/ui/field-cell";
import { ExportMenu } from "@/components/results/export-menu";
import { BatchWorkspaceNav } from "@/components/batches/batch-workspace-nav";
import { DEFAULT_SCENARIO_ID, getScenarioFields, isCoreColumn, type FieldDef } from "@/lib/fields/field-schema";
import { useFieldSchema } from "@/lib/fields/use-field-schema";
import { apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { ExportScope } from "@/lib/workflows/exports";
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
  extraJson?: string | null;
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

interface RowsPage {
  rows: ApiRecognitionRow[];
  total: number;
  page: number;
}

function safeParseObject(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
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
    riskReasons: reasons,
    conflictReason: reasons.length ? reasons.join("、") : undefined,
    remark: row.remark ?? "",
    extra: safeParseObject(row.extraJson),
    updatedAt: "",
  };
}

/** 取字段在展示行上的当前值：核心列直接取，非核心列从 extra 取。 */
function fieldValue(row: RecognitionRow, field: FieldDef): string | number {
  if (isCoreColumn(field.key)) {
    return (row as unknown as Record<string, string | number>)[field.key] ?? (field.type === "number" ? 0 : "");
  }
  return row.extra[field.key] ?? "";
}

/** 把一次字段编辑乐观地合并进已缓存的某一行（核心列或 extraJson）。 */
function patchCachedRow(old: RowsPage | undefined, id: string, patch: Record<string, unknown>): RowsPage | undefined {
  if (!old?.rows) return old;
  return {
    ...old,
    rows: old.rows.map((row) => {
      if (row.id !== id) return row;
      const next: ApiRecognitionRow = { ...row };
      for (const [key, value] of Object.entries(patch)) {
        if (key === "extra") {
          next.extraJson = JSON.stringify({ ...safeParseObject(row.extraJson), ...(value as Record<string, unknown>) });
        } else {
          (next as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return next;
    }),
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
    // 从批次工作区进入时携带 ?batchId=，把全局结果收窄为该批次视图。
    batchId: searchParams.get("batchId") ?? "",
  });
  // 行级多选：按 id 跨页保留；选中时导出仅这些行（scope.rowIds），否则按当前筛选。
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const fieldSchema = useFieldSchema();
  // 加载前用默认场景字段兜底，避免初次渲染列结构跳变。
  const fields = fieldSchema.data?.fields ?? getScenarioFields(DEFAULT_SCENARIO_ID);

  const queryString = (() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filters.batchId) params.set("batchId", filters.batchId);
    if (filters.status) params.set("status", filters.status);
    if (filters.risk) params.set("risk", filters.risk);
    if (filters.audit) params.set("auditState", filters.audit);
    if (filters.name) params.set("name", filters.name);
    return params.toString();
  })();

  const { data, isLoading } = useQuery<RowsPage>({
    queryKey: ["rows", queryString],
    queryFn: () => apiGet(`${apiPaths.rows}?${queryString}`),
  });

  const rows = data?.rows?.map(toRecognitionRow) ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageRowIds = rows.map((row) => row.id);
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function togglePage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageRowIds.forEach((id) => next.delete(id));
      else pageRowIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // 选中行 → 导出仅这些行；否则按当前筛选条件导出。
  const exportScope: ExportScope =
    selectedCount > 0
      ? { rowIds: [...selectedIds] }
      : { batchId: filters.batchId, status: filters.status, risk: filters.risk, auditState: filters.audit, name: filters.name };

  const updateRow = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiJson(apiPaths.row(id), { method: "PATCH", body: JSON.stringify(patch) }),
    // 乐观更新：就地改缓存行，不重排不闪烁；后台静默校正，避免编辑后整表重拉跳行。
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["rows"] });
      queryClient.setQueriesData<RowsPage>({ queryKey: ["rows"] }, (old) => patchCachedRow(old, id, patch));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function commitField(id: string, field: FieldDef, raw: string) {
    const value = field.type === "number" ? Number(raw || 0) : raw;
    const patch = isCoreColumn(field.key) ? { [field.key]: value } : { extra: { [field.key]: value } };
    updateRow.mutate({ id, patch });
  }

  const confirmRow = useMutation({
    mutationFn: (id: string) =>
      apiJson(apiPaths.rowsBulkConfirm, { method: "POST", body: JSON.stringify({ rowIds: [id] }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const excludeRow = useMutation({
    mutationFn: (id: string) => apiJson(apiPaths.row(id), { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const rebuild = useMutation({
    mutationFn: () => apiJson(apiPaths.productsRebuild, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function patchFilter(patch: Partial<typeof filters>) {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }

  const columnCount = 5 + fields.length + 6;

  return (
    <div className="space-y-4">
      {filters.batchId ? <BatchWorkspaceNav batchId={filters.batchId} active="results" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">全部结果</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看、筛选、编辑、确认所有识别明细行。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            <RotateCcw size={15} />重建产品库
          </Button>
          <ExportMenu scope={exportScope} />
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
          {filters.batchId ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary">
              批次：{rows[0]?.batchName ?? filters.batchId}
              <button aria-label="清除批次筛选" className="hover:text-primary-hover" onClick={() => patchFilter({ batchId: "" })}>
                <X size={12} />
              </button>
            </span>
          ) : null}
          {selectedCount > 0 ? (
            <span className="inline-flex items-center gap-2 text-xs text-foreground">
              已选 {selectedCount} 行
              <button className="text-muted-foreground underline-offset-2 hover:underline" onClick={clearSelection}>
                清除
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary align-middle"
                  aria-label="选择本页全部行"
                  checked={allPageSelected}
                  onChange={togglePage}
                />
              </th>
              <th className={tableCellClass}>行号</th>
              <th className={tableCellClass}>批次</th>
              <th className={tableCellClass}>文档</th>
              <th className={tableCellClass}>月份</th>
              {fields.map((field) => (
                <th key={field.key} className={tableCellClass}>
                  {field.label}
                </th>
              ))}
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
                <tr key={row.id} className={selectedIds.has(row.id) ? "bg-primary/5" : "hover:bg-muted/70"}>
                  <td className={tableCellClass}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary align-middle"
                      aria-label={`选择第 ${(page - 1) * PAGE_SIZE + index + 1} 行`}
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                    />
                  </td>
                  <td className={tableCellClass}>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className={tableCellClass}>
                    <Link href={`/batches/${row.batchId}`} className="text-primary hover:underline">
                      {row.batchName}
                    </Link>
                  </td>
                  <td className={tableCellClass}>{row.documentName}</td>
                  <td className={tableCellClass}>{row.month || "-"}</td>
                  {fields.map((field) => (
                    <FieldCell
                      key={field.key}
                      value={fieldValue(row, field)}
                      type={field.type === "number" ? "number" : "text"}
                      align={field.align ?? (field.type === "number" ? "right" : "left")}
                      disabled={!field.editable}
                      onCommit={(next) => commitField(row.id, field, next)}
                    />
                  ))}
                  <td className={tableCellClass}><RiskBadge risk={row.risk} /></td>
                  <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                  <td className={tableCellClass}><ReviewClassBadge value={row.reviewClass} /></td>
                  <td className={tableCellClass}>
                    <span title={row.auditNote ?? undefined}>
                      <AuditStateBadge value={row.auditState ?? "none"} />
                    </span>
                  </td>
                  <td className={tableCellClass}><ReasonList codes={row.riskReasons ?? []} emptyText="-" /></td>
                  <td className={tableCellClass}>
                    <div className="flex gap-1">
                      {row.status !== "confirmed" || row.auditState === "flagged" ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link
                            href={`/review?batchId=${row.batchId}&documentId=${row.documentId}`}
                            title="到审核台查看原图并逐行复核"
                          >
                            审核
                          </Link>
                        </Button>
                      ) : null}
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
                <td className={tableCellClass} colSpan={columnCount}>
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
