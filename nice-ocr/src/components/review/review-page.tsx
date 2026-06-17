"use client";

import { Check, ChevronLeft, ChevronRight, ImageOff, Maximize2, Search, ShieldCheck, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ApprovalModeBadge, AuditStateBadge, ReviewClassBadge, RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass } from "@/components/ui/table";
import { EditableCell } from "@/components/ui/editable-cell";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { RiskDetailDrawer } from "@/components/dialogs/action-dialogs";
import { apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { RiskLevel, RowStatus } from "@/lib/types";

interface ApiRow {
  id: string;
  rowIndex: number;
  code?: string | null;
  name: string;
  unit?: string | null;
  qty: number;
  price: number;
  amount: number;
  riskLevel: RiskLevel;
  status: RowStatus;
  reviewClass: string;
  riskReasonsJson?: string | null;
  auditState: string;
  auditNote?: string | null;
  auditSuggestionJson?: string | null;
}

interface ApiAttempt {
  id: string;
  providerKey: string;
  model: string;
  status: string;
  strategy: string;
  startedAt: string;
  completedAt?: string | null;
  error?: string | null;
}

interface ApiDocument {
  id: string;
  originalName: string;
  riskLevel: RiskLevel;
  riskReasonsJson?: string | null;
  rows: ApiRow[];
  attempts: ApiAttempt[];
}

type ReviewState = "pending" | "partial" | "confirmed" | "conflict";

interface BatchDoc {
  id: string;
  originalName: string;
  riskLevel: RiskLevel;
  reviewState: ReviewState;
  rowStats: { total: number; confirmed: number; conflict: number };
}

interface BatchDetail {
  batch: {
    id: string;
    name: string;
    approvalMode: string;
    documents: BatchDoc[];
  };
}

const docStateBadge: Record<ReviewState, { label: string; tone: "warning" | "info" | "success" | "danger" }> = {
  pending: { label: "待复核", tone: "warning" },
  partial: { label: "部分确认", tone: "info" },
  confirmed: { label: "已确认", tone: "success" },
  conflict: { label: "冲突", tone: "danger" },
};

const docFilters: Array<{ key: ReviewState | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待复核" },
  { key: "partial", label: "部分确认" },
  { key: "confirmed", label: "已确认" },
  { key: "conflict", label: "冲突" },
];

const DOC_PAGE_SIZE = 8;

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [riskOpen, setRiskOpen] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [imageErrorId, setImageErrorId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<ReviewState | "all">("all");
  const [docPage, setDocPage] = useState(1);

  function selectDoc(id: string) {
    setOverride(id);
    setZoom(1);
  }

  const { data: batchData } = useQuery<{ batches: Array<{ id: string }> }>({
    queryKey: ["batches"],
    queryFn: () => apiGet(apiPaths.batches),
  });
  const activeBatchId = batchData?.batches[0]?.id;

  const { data: batchDetail } = useQuery<BatchDetail>({
    queryKey: ["batch", activeBatchId],
    queryFn: () => apiGet(apiPaths.batch(activeBatchId as string)),
    enabled: Boolean(activeBatchId),
  });

  const documents = batchDetail?.batch.documents ?? [];
  const selectedId = override ?? documents[0]?.id ?? null;
  const selectedIndex = documents.findIndex((doc) => doc.id === selectedId);

  const { data: docData, isLoading } = useQuery<{ document: ApiDocument }>({
    queryKey: ["document", selectedId],
    queryFn: () => apiGet(apiPaths.document(selectedId as string)),
    enabled: Boolean(selectedId),
  });

  const document = docData?.document;
  const rows = document?.rows ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["document", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["batch", activeBatchId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const confirmRows = useMutation({
    mutationFn: (payload: { rowIds?: string[]; documentId?: string }) =>
      apiJson(apiPaths.rowsBulkConfirm, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: invalidate,
  });

  const updateRow = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiJson(apiPaths.row(id), { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  });

  function commitField(id: string, field: "code" | "name" | "unit" | "qty" | "price" | "amount", raw: string) {
    const numeric = field === "qty" || field === "price" || field === "amount";
    updateRow.mutate({ id, patch: { [field]: numeric ? Number(raw || 0) : raw } });
  }

  const runAudit = useMutation({
    mutationFn: () => apiJson(apiPaths.batchAudit(activeBatchId as string), { method: "POST" }),
    onSuccess: invalidate,
  });

  function adoptSuggestion(row: ApiRow) {
    if (!row.auditSuggestionJson) return;
    try {
      const s = JSON.parse(row.auditSuggestionJson) as Partial<ApiRow>;
      updateRow.mutate({
        id: row.id,
        patch: { code: s.code ?? "", name: s.name, unit: s.unit ?? "", qty: s.qty, price: s.price, amount: s.amount },
      });
    } catch {
      /* 建议值解析失败则忽略 */
    }
  }

  function goTo(offset: number) {
    if (selectedIndex < 0) return;
    const next = documents[selectedIndex + offset];
    if (next) selectDoc(next.id);
  }

  if (!activeBatchId) {
    return <EmptyState message="暂无批次，请先创建批次并上传单据。" />;
  }
  if (!documents.length) {
    return <EmptyState message="当前批次还没有文档，请先上传单据。" />;
  }

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = docSearch ? doc.originalName.toLowerCase().includes(docSearch.toLowerCase()) : true;
    const matchesFilter = docFilter === "all" ? true : doc.reviewState === docFilter;
    return matchesSearch && matchesFilter;
  });
  const docTotalPages = Math.max(1, Math.ceil(filteredDocs.length / DOC_PAGE_SIZE));
  const safeDocPage = Math.min(docPage, docTotalPages);
  const pagedDocs = filteredDocs.slice((safeDocPage - 1) * DOC_PAGE_SIZE, safeDocPage * DOC_PAGE_SIZE);

  const riskReasons: string[] = (() => {
    try {
      return JSON.parse(document?.riskReasonsJson || "[]");
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">审核工作台</h1>
            {batchDetail ? <ApprovalModeBadge mode={batchDetail.batch.approvalMode} /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">左侧原图可缩放、文档可过滤；右侧点击单元格即可直接修改识别结果。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => goTo(-1)} disabled={selectedIndex <= 0}>
            <ChevronLeft size={15} />上一张
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => goTo(1)}
            disabled={selectedIndex < 0 || selectedIndex >= documents.length - 1}
          >
            下一张<ChevronRight size={15} />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => runAudit.mutate()}
            disabled={runAudit.isPending}
            title="对本批次机器自动通过的行做二次复查（需 worker 运行）"
          >
            <ShieldCheck size={15} />运行审核
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => selectedId && confirmRows.mutate({ documentId: selectedId })}
            disabled={confirmRows.isPending || !rows.length}
          >
            <Check size={15} />确认本单所有行
          </Button>
        </div>
      </div>

      <div className="grid min-h-[650px] gap-4 xl:grid-cols-[42%_1fr]">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader>
            <PanelTitle>{document?.originalName ?? "加载中..."}</PanelTitle>
            {document ? <RiskBadge risk={document.riskLevel} /> : null}
          </PanelHeader>
          <div className="flex items-center gap-1 border-b border-border px-4 py-2">
            <Button size="icon" variant="ghost" aria-label="放大" onClick={() => setZoom((z) => Math.min(5, Number((z + 0.25).toFixed(2))))}>
              <ZoomIn size={15} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="缩小" onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}>
              <ZoomOut size={15} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="适应窗口" onClick={() => setZoom(1)}>
              <Maximize2 size={15} />
            </Button>
            <span className="ml-1 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+滚轮缩放</span>
          </div>
          <div
            className="flex min-h-[360px] flex-1 items-start justify-center overflow-auto bg-muted p-4"
            onWheel={(event) => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              setZoom((z) => Math.min(5, Math.max(0.25, Number((z - Math.sign(event.deltaY) * 0.25).toFixed(2)))));
            }}
          >
            {selectedId && imageErrorId !== selectedId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={selectedId}
                src={apiPaths.documentImage(selectedId)}
                alt={document?.originalName ?? "单据原图"}
                style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
                className="h-auto rounded border border-border bg-white object-contain shadow-sm"
                onError={() => setImageErrorId(selectedId)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 self-center text-muted-foreground">
                <ImageOff size={28} />
                <span className="text-xs">原图不可用（未上传或文件缺失）</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border p-3">
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-2 text-sm">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={docSearch}
                onChange={(event) => {
                  setDocSearch(event.target.value);
                  setDocPage(1);
                }}
                placeholder="按文件名筛选文档"
                className="h-full flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {docFilters.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setDocFilter(filter.key);
                    setDocPage(1);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                    docFilter === filter.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="max-h-56 space-y-1 overflow-auto">
              {pagedDocs.length ? (
                pagedDocs.map((doc) => {
                  const badge = docStateBadge[doc.reviewState];
                  return (
                    <button
                      key={doc.id}
                      onClick={() => selectDoc(doc.id)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                        doc.id === selectedId ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{doc.originalName}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{doc.rowStats.confirmed}/{doc.rowStats.total} 已确认</span>
                        <RiskBadge risk={doc.riskLevel} />
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">没有符合条件的文档</div>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>共 {filteredDocs.length} 个文档</span>
              <div className="flex items-center gap-1">
                <button
                  className="h-6 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
                  onClick={() => setDocPage((current) => Math.max(1, current - 1))}
                  disabled={safeDocPage <= 1}
                >
                  上一页
                </button>
                <span>{safeDocPage} / {docTotalPages}</span>
                <button
                  className="h-6 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
                  onClick={() => setDocPage((current) => Math.min(docTotalPages, current + 1))}
                  disabled={safeDocPage >= docTotalPages}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader>
              <PanelTitle>识别明细</PanelTitle>
              <span className="text-xs text-muted-foreground">{rows.length} 行 · 点击单元格可编辑</span>
            </PanelHeader>
            <div className="max-h-[360px] overflow-auto">
              <DataTable>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableCellClass}>行</th>
                    <th className={tableCellClass}>产品编码</th>
                    <th className={tableCellClass}>产品名称</th>
                    <th className={tableCellClass}>单位</th>
                    <th className={tableCellClass}>数量</th>
                    <th className={tableCellClass}>单价</th>
                    <th className={tableCellClass}>金额</th>
                    <th className={tableCellClass}>状态</th>
                    <th className={tableCellClass}>标识类别</th>
                    <th className={tableCellClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-muted/40">
                        <td className={tableCellClass}>{index + 1}</td>
                        <EditableCell
                          value={row.code ?? ""}
                          format={(value) => (value ? String(value) : "-")}
                          onCommit={(next) => commitField(row.id, "code", next)}
                        />
                        <EditableCell value={row.name} onCommit={(next) => commitField(row.id, "name", next)} />
                        <EditableCell
                          value={row.unit ?? ""}
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
                        <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                        <td className={tableCellClass}>
                          <div className="flex flex-col items-start gap-1">
                            <ReviewClassBadge value={row.reviewClass} />
                            {row.auditState && row.auditState !== "none" ? (
                              <span title={row.auditNote ?? undefined}>
                                <AuditStateBadge value={row.auditState} />
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex gap-1">
                            {row.auditState === "flagged" && row.auditSuggestionJson ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => adoptSuggestion(row)}
                                disabled={updateRow.isPending}
                                title={`采纳审核建议：${row.auditNote ?? ""}`}
                              >
                                <Wand2 size={14} />采纳
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => confirmRows.mutate({ rowIds: [row.id] })}
                              disabled={confirmRows.isPending || row.status === "confirmed"}
                            >
                              确认
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={tableCellClass} colSpan={10}>
                        <span className="text-muted-foreground">{isLoading ? "加载中..." : "该文档暂无识别行"}</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </DataTable>
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>识别尝试</PanelTitle>
              <span className="text-xs text-muted-foreground">{document?.attempts.length ?? 0} 次</span>
            </PanelHeader>
            <div className="divide-y divide-border">
              {document?.attempts.length ? (
                document.attempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <div className="font-medium">{attempt.providerKey}/{attempt.model}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        策略 {attempt.strategy} · {formatDateTime(attempt.completedAt ?? attempt.startedAt)}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{attempt.error ?? attempt.status}</span>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">暂无识别尝试记录</div>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>风险详情</PanelTitle>
              {document ? <RiskBadge risk={document.riskLevel} /> : null}
            </PanelHeader>
            <div className="space-y-2 p-4 text-sm">
              <div>风险原因：{riskReasons.length ? riskReasons.join("、") : "无"}</div>
              <div className="text-muted-foreground">建议：核对原图与识别明细，点击单元格修正后逐行确认。</div>
              <Button size="sm" variant="primary" onClick={() => setRiskOpen(true)}>查看风险说明</Button>
            </div>
          </Panel>
        </div>
      </div>
      <RiskDetailDrawer open={riskOpen} onClose={() => setRiskOpen(false)} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">审核工作台</h1>
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
        {message}
      </div>
    </div>
  );
}
