"use client";

import { Check, ChevronLeft, ChevronRight, ImageOff, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ApprovalModeBadge, ReviewClassBadge, RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass } from "@/components/ui/table";
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

interface BatchDetail {
  batch: {
    id: string;
    name: string;
    approvalMode: string;
    documents: Array<{ id: string; originalName: string; riskLevel: RiskLevel }>;
  };
}

export function ReviewPage() {
  const queryClient = useQueryClient();
  const [riskOpen, setRiskOpen] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [imageErrorId, setImageErrorId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

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

  const confirmRows = useMutation({
    mutationFn: (payload: { rowIds?: string[]; documentId?: string }) =>
      apiJson(apiPaths.rowsBulkConfirm, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

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
          <p className="mt-1 text-sm text-muted-foreground">左侧查看原图（可缩放），右侧核对识别结果并标注审核类别。</p>
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
            className="flex min-h-[430px] flex-1 items-start justify-center overflow-auto bg-muted p-4"
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
          <div className="border-t border-border p-3">
            <div className="flex gap-2 overflow-x-auto">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => selectDoc(doc.id)}
                  className={`w-28 shrink-0 rounded-md border p-1 text-left ${
                    doc.id === selectedId ? "border-primary" : "border-border"
                  } bg-surface`}
                >
                  <div className="flex h-16 items-center justify-center rounded bg-muted text-[11px] text-muted-foreground">
                    预览
                  </div>
                  <div className="mt-1 truncate text-[11px]">{doc.originalName}</div>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader>
              <PanelTitle>识别明细</PanelTitle>
              <span className="text-xs text-muted-foreground">{rows.length} 行</span>
            </PanelHeader>
            <div className="max-h-[315px] overflow-auto">
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
                      <tr key={row.id} className="hover:bg-muted/70">
                        <td className={tableCellClass}>{index + 1}</td>
                        <td className={tableCellClass}>{row.code || "-"}</td>
                        <td className={tableCellClass}>{row.name}</td>
                        <td className={tableCellClass}>{row.unit || "-"}</td>
                        <td className={tableCellClass}>{Number(row.qty).toFixed(2)}</td>
                        <td className={tableCellClass}>{formatCurrency(Number(row.price))}</td>
                        <td className={tableCellClass}>{formatCurrency(Number(row.amount))}</td>
                        <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                        <td className={tableCellClass}><ReviewClassBadge value={row.reviewClass} /></td>
                        <td className={tableCellClass}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => confirmRows.mutate({ rowIds: [row.id] })}
                            disabled={confirmRows.isPending || row.status === "confirmed"}
                          >
                            确认
                          </Button>
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
              <div className="text-muted-foreground">建议：核对原图与识别明细，确认或修正后逐行确认。</div>
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
