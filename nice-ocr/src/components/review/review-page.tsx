"use client";

import { Boxes, Check, ChevronLeft, ChevronRight, Maximize2, Minimize2, Plus, Search, ShieldCheck, Trash2, Wand2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ApprovalModeBadge, AuditStateBadge, ReviewClassBadge, RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { ModelErrorNote, ReasonList } from "@/components/ui/reason-badge";
import { DataTable, tableCellClass, tableHeadClass } from "@/components/ui/table";
import { FieldCell } from "@/components/ui/field-cell";
import { ImageViewer } from "@/components/ui/image-viewer";
import { BatchWorkspaceNav } from "@/components/batches/batch-workspace-nav";
import { BatchScopeSelect } from "@/components/batches/batch-scope-select";
import { useSidebar } from "@/components/app-shell/sidebar-context";
import { cn, formatDateTime } from "@/lib/utils";
import { RiskDetailDrawer } from "@/components/dialogs/action-dialogs";
import { DEFAULT_SCENARIO_ID, getScenarioFields, isCoreColumn, type FieldDef } from "@/lib/fields/field-schema";
import { useFieldSchema } from "@/lib/fields/use-field-schema";
import { apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { RiskLevel, RowStatus } from "@/lib/types";

function safeParseObject(raw?: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

interface ApiRow {
  id: string;
  rowIndex: number;
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
  riskReasonsJson?: string | null;
  auditState: string;
  auditNote?: string | null;
  auditSuggestionJson?: string | null;
}

/** 取字段在审核行上的当前值：核心列直接取，非核心列从 extraJson 取。 */
function rowFieldValue(row: ApiRow, field: FieldDef): string | number {
  if (isCoreColumn(field.key)) {
    return (row as unknown as Record<string, string | number>)[field.key] ?? (field.type === "number" ? 0 : "");
  }
  return safeParseObject(row.extraJson)[field.key] ?? "";
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

/** 跨批次审核待办文档（/api/documents 返回项）：每条标注所属批次。 */
interface WorklistDoc {
  id: string;
  originalName: string;
  batchId: string;
  batchName: string;
  riskLevel: RiskLevel;
  reviewState: ReviewState;
  rowStats: { total: number; confirmed: number; conflict: number };
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
  const searchParams = useSearchParams();
  // 作用域单一事实源：URL ?batchId=（null=全部跨批次待办）。
  const batchIdParam = searchParams.get("batchId");
  const documentIdParam = searchParams.get("documentId");
  const [riskOpen, setRiskOpen] = useState(false);
  // 进入审核台时若带 ?documentId= 则直接定位该文档（来自批次详情/结果页/仪表盘的直达跳转）。
  const [override, setOverride] = useState<string | null>(documentIdParam);
  const [docSearch, setDocSearch] = useState("");
  const [docFilter, setDocFilter] = useState<ReviewState | "all">("all");
  const [docPage, setDocPage] = useState(1);
  const [focus, setFocus] = useState(false);
  const { setCollapsed } = useSidebar();
  // 行内删除二次确认：记录待删除行 id。
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 新增草稿行：undefined=无草稿；null=末尾追加；string=在该行下方插入。
  const [draftAfterId, setDraftAfterId] = useState<string | null | undefined>(undefined);

  // 作用域随 URL 切换时同步选中文档：带 documentId 深链则定位之，否则回到列表首项（清空旧批次的陈旧选中）。
  // render 阶段调整状态，优于 effect：避免跨批次陈旧 documentId 的一帧闪烁。
  const urlScopeKey = `${batchIdParam ?? ""}|${documentIdParam ?? ""}`;
  const [prevScopeKey, setPrevScopeKey] = useState(urlScopeKey);
  if (prevScopeKey !== urlScopeKey) {
    setPrevScopeKey(urlScopeKey);
    setOverride(documentIdParam);
  }

  function selectDoc(id: string) {
    setOverride(id);
  }

  // 跨批次/单批次文档待办列表（审核数据通路）：无 batchId=全部，带 batchId=隔离到该批次。
  const { data: docList } = useQuery<{ documents: WorklistDoc[] }>({
    queryKey: ["documents", batchIdParam ?? "all"],
    queryFn: () => apiGet(batchIdParam ? `${apiPaths.documents}?batchId=${batchIdParam}` : apiPaths.documents),
  });
  const documents = useMemo(() => docList?.documents ?? [], [docList]);

  // 隔离模式取批次头信息（名称/审批模式）；全部模式无单一批次。
  const { data: batchDetail } = useQuery<{ batch: { id: string; name: string; approvalMode: string } }>({
    queryKey: ["batch", batchIdParam],
    queryFn: () => apiGet(apiPaths.batch(batchIdParam as string)),
    enabled: Boolean(batchIdParam),
  });

  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const matchesSearch = docSearch ? doc.originalName.toLowerCase().includes(docSearch.toLowerCase()) : true;
        const matchesFilter = docFilter === "all" ? true : doc.reviewState === docFilter;
        return matchesSearch && matchesFilter;
      }),
    [documents, docSearch, docFilter],
  );

  const selectedId = override ?? documents[0]?.id ?? null;
  const selectedDoc = documents.find((doc) => doc.id === selectedId) ?? null;
  // 导航在「当前过滤列表」内迭代（全部/隔离统一）。
  const selectedIndex = filteredDocs.findIndex((doc) => doc.id === selectedId);
  // 列与审核动作按所选文档所属批次解析（全部模式每文档单场景，无错位）。
  const activeDocBatchId = selectedDoc?.batchId ?? batchIdParam ?? undefined;

  const { data: docData, isLoading } = useQuery<{ document: ApiDocument }>({
    queryKey: ["document", selectedId],
    queryFn: () => apiGet(apiPaths.document(selectedId as string)),
    enabled: Boolean(selectedId),
  });

  const document = docData?.document;
  const rows = document?.rows ?? [];

  const fieldSchema = useFieldSchema({ batchId: activeDocBatchId });
  // 加载前用默认场景字段兜底，避免列结构跳变。
  const fields = fieldSchema.data?.fields ?? getScenarioFields(DEFAULT_SCENARIO_ID);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["document", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    if (selectedDoc?.batchId) queryClient.invalidateQueries({ queryKey: ["batch", selectedDoc.batchId] });
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

  const deleteRow = useMutation({
    mutationFn: (id: string) => apiJson(apiPaths.row(id), { method: "DELETE" }),
    onSuccess: () => {
      setDeletingId(null);
      invalidate();
    },
  });

  const createRow = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiJson(apiPaths.rows, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setDraftAfterId(undefined);
      invalidate();
    },
  });

  // 保存草稿行：按 field-schema 拆分核心列 / extra 列，afterRowId 决定插入位置（null=末尾）。
  function saveDraft(values: Record<string, string>) {
    if (!selectedId) return;
    const core: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};
    for (const field of fields) {
      if (!field.editable) continue;
      const raw = values[field.key] ?? "";
      const value = field.type === "number" ? Number(raw || 0) : raw;
      if (isCoreColumn(field.key)) core[field.key] = value;
      else extra[field.key] = value;
    }
    createRow.mutate({
      documentId: selectedId,
      afterRowId: draftAfterId ?? null,
      ...core,
      ...(Object.keys(extra).length ? { extra } : {}),
    });
  }

  function commitField(id: string, field: FieldDef, raw: string) {
    const value = field.type === "number" ? Number(raw || 0) : raw;
    const patch = isCoreColumn(field.key) ? { [field.key]: value } : { extra: { [field.key]: value } };
    updateRow.mutate({ id, patch });
  }

  // 运行审核是批次级动作：作用于当前所选文档所属批次（全部/隔离统一）。
  const runAudit = useMutation({
    mutationFn: () => apiJson(apiPaths.batchAudit(activeDocBatchId as string), { method: "POST" }),
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
    const next = filteredDocs[selectedIndex + offset];
    if (next) selectDoc(next.id);
  }

  // 专注模式联动侧边栏：进入折叠、退出展开，给原图与明细让出横向空间。
  // 跳过首次挂载，避免覆盖用户在普通模式的折叠偏好；仅在用户切换专注态时联动。
  const focusInitRef = useRef(true);
  useEffect(() => {
    if (focusInitRef.current) {
      focusInitRef.current = false;
      return;
    }
    setCollapsed(focus);
  }, [focus, setCollapsed]);

  // 专注模式键盘导航：←/→ 切换单据，Esc 退出（在输入框/下拉里只处理 Esc，不拦截编辑）。
  useEffect(() => {
    if (!focus) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (event.key === "Escape") {
        setFocus(false);
        return;
      }
      if (typing) return;
      if (event.key === "ArrowLeft" && selectedIndex > 0) {
        event.preventDefault();
        setOverride(filteredDocs[selectedIndex - 1].id);
      } else if (event.key === "ArrowRight" && selectedIndex < filteredDocs.length - 1) {
        event.preventDefault();
        setOverride(filteredDocs[selectedIndex + 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, selectedIndex, filteredDocs]);

  const isAllScope = !batchIdParam;

  if (!documents.length) {
    return (
      <EmptyState
        batchId={batchIdParam ?? ""}
        message={
          isAllScope
            ? "暂无待审文档。请先创建批次并上传单据。"
            : "当前批次还没有文档，请先上传单据，或切换到「全部」查看其他批次。"
        }
      />
    );
  }

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
      {!focus && batchIdParam ? <BatchWorkspaceNav batchId={batchIdParam} active="review" /> : null}
      {focus ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => setFocus(false)} title="退出专注模式（Esc）">
              <Minimize2 size={15} />退出专注
            </Button>
            <span className="truncate text-sm font-medium">{document?.originalName ?? "单据"}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{selectedIndex + 1} / {filteredDocs.length}</span>
            {document ? (
              <button
                type="button"
                onClick={() => setRiskOpen(true)}
                title="查看风险详情"
                className="shrink-0"
              >
                <RiskBadge risk={document.riskLevel} />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => goTo(-1)} disabled={selectedIndex <= 0} title="上一张（←）">
              <ChevronLeft size={15} />
            </Button>
            <select
              value={selectedId ?? ""}
              onChange={(event) => event.target.value && selectDoc(event.target.value)}
              className="h-8 max-w-48 rounded-md border border-border bg-surface px-2 text-xs outline-none focus:border-primary"
              title="快速跳转文件"
            >
              {filteredDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.originalName}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={() => goTo(1)} disabled={selectedIndex >= filteredDocs.length - 1} title="下一张（→）">
              <ChevronRight size={15} />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runAudit.mutate()}
              disabled={runAudit.isPending || !activeDocBatchId}
              title="对机器自动通过的行做二次复查（需 worker 运行）"
            >
              <ShieldCheck size={15} />运行审核
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => selectedId && confirmRows.mutate({ documentId: selectedId })}
              disabled={confirmRows.isPending || !rows.length}
            >
              <Check size={15} />确认本单
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">审核工作台</h1>
              {batchDetail ? (
                <span className="text-sm text-muted-foreground">· {batchDetail.batch.name}</span>
              ) : (
                <span className="text-sm text-muted-foreground">· 全部批次待办</span>
              )}
              {batchDetail ? <ApprovalModeBadge mode={batchDetail.batch.approvalMode} /> : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">左侧选择文件、中间查看原图（可缩放/拖拽）、右侧点击单元格直接修改识别结果。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BatchScopeSelect batchId={batchIdParam ?? ""} />
            <Button size="sm" variant="secondary" onClick={() => setFocus(true)} title="进入专注模式：放大原图与明细、隐藏次要面板，←/→ 切换单据">
              <Maximize2 size={15} />专注模式
            </Button>
            <Button size="sm" variant="secondary" onClick={() => goTo(-1)} disabled={selectedIndex <= 0}>
              <ChevronLeft size={15} />上一张
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => goTo(1)}
              disabled={selectedIndex < 0 || selectedIndex >= filteredDocs.length - 1}
            >
              下一张<ChevronRight size={15} />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runAudit.mutate()}
              disabled={runAudit.isPending || !activeDocBatchId}
              title="对当前单据所属批次机器自动通过的行做二次复查（需 worker 运行）"
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
      )}

      <div
        className={cn(
          "grid gap-4",
          focus
            ? // 专注模式固定视口高度（非 min-h），使两列等高、明细内部滚动、原图垂直居中；
              // 否则表格内容会撑开行高，导致 flex-1+overflow 失效（明细过长、原图被推到底部）。
              "h-[calc(100vh-9.5rem)] min-h-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
            : "min-h-[640px] xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,1.3fr)]",
        )}
      >
        {/* 列 1：文件列表 —— 仅普通模式；专注模式用顶部精简控制条 + 快速跳转切换 */}
        {!focus ? (
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader>
            <PanelTitle>文件</PanelTitle>
            <span className="text-xs text-muted-foreground">{filteredDocs.length} 个</span>
          </PanelHeader>
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-2 text-sm">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={docSearch}
                onChange={(event) => {
                  setDocSearch(event.target.value);
                  setDocPage(1);
                }}
                placeholder="搜索文件名"
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
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
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
                    {/* 全部模式标注所属批次（收件箱式来源标签）；隔离模式同批次无需重复。 */}
                    {isAllScope ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Boxes size={11} className="shrink-0" />
                        <span className="truncate">{doc.batchName}</span>
                      </div>
                    ) : null}
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
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>{safeDocPage} / {docTotalPages}</span>
            <div className="flex items-center gap-1">
              <button
                className="h-6 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
                onClick={() => setDocPage((current) => Math.max(1, current - 1))}
                disabled={safeDocPage <= 1}
              >
                上一页
              </button>
              <button
                className="h-6 rounded border border-border bg-surface px-2 hover:bg-muted disabled:opacity-50"
                onClick={() => setDocPage((current) => Math.min(docTotalPages, current + 1))}
                disabled={safeDocPage >= docTotalPages}
              >
                下一页
              </button>
            </div>
          </div>
        </Panel>
        ) : null}

        {/* 列 2：原图预览（可缩放 + 拖拽平移） */}
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader>
            <PanelTitle className="truncate">{document?.originalName ?? "单据预览"}</PanelTitle>
            {document ? <RiskBadge risk={document.riskLevel} /> : null}
          </PanelHeader>
          <ImageViewer
            className="flex-1"
            src={selectedId ? apiPaths.documentImage(selectedId) : null}
            alt={document?.originalName ?? "单据原图"}
          />

        </Panel>

        <div className={cn("min-w-0", focus ? "flex min-h-0 flex-col" : "space-y-4")}>
          <Panel className={cn(focus && "flex min-h-0 flex-1 flex-col")}>
            <PanelHeader>
              <PanelTitle>识别明细</PanelTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{rows.length} 行 · 点击单元格可编辑</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDraftAfterId(null)}
                  disabled={!selectedId || draftAfterId !== undefined}
                  title="在明细末尾新增一行（也可在某行右侧点「+」就近插入）"
                >
                  <Plus size={14} />新增行
                </Button>
              </div>
            </PanelHeader>
            <div className={cn("overflow-auto", focus ? "min-h-0 flex-1" : "max-h-[360px]")}>
              <DataTable>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableCellClass}>行</th>
                    {fields.map((field) => (
                      <th key={field.key} className={tableCellClass}>
                        {field.label}
                      </th>
                    ))}
                    <th className={tableCellClass}>状态</th>
                    <th className={tableCellClass}>标识类别</th>
                    <th className={tableCellClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row, index) => (
                      <Fragment key={row.id}>
                      <tr className="hover:bg-muted/40">
                        <td className={tableCellClass}>{index + 1}</td>
                        {fields.map((field) => (
                          <FieldCell
                            key={field.key}
                            value={rowFieldValue(row, field)}
                            type={field.type === "number" ? "number" : "text"}
                            align={field.align ?? (field.type === "number" ? "right" : "left")}
                            disabled={!field.editable}
                            onCommit={(next) => commitField(row.id, field, next)}
                          />
                        ))}
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
                          {deletingId === row.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-danger-strong">删除此行？</span>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => deleteRow.mutate(row.id)}
                                disabled={deleteRow.isPending}
                                title="确认删除（软删除，可在审计日志追溯）"
                              >
                                确认
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)} disabled={deleteRow.isPending}>
                                取消
                              </Button>
                            </div>
                          ) : (
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
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDraftAfterId(row.id)}
                                disabled={draftAfterId !== undefined}
                                title="在此行下方插入新行"
                              >
                                <Plus size={14} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeletingId(row.id)}
                                title="删除此行"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {draftAfterId === row.id ? (
                        <DraftRow
                          fields={fields}
                          isPending={createRow.isPending}
                          onSave={saveDraft}
                          onCancel={() => setDraftAfterId(undefined)}
                        />
                      ) : null}
                      </Fragment>
                    ))
                  ) : draftAfterId === null ? null : (
                    <tr>
                      <td className={tableCellClass} colSpan={4 + fields.length}>
                        <span className="text-muted-foreground">{isLoading ? "加载中..." : "该文档暂无识别行"}</span>
                      </td>
                    </tr>
                  )}
                  {draftAfterId === null ? (
                    <DraftRow
                      fields={fields}
                      isPending={createRow.isPending}
                      onSave={saveDraft}
                      onCancel={() => setDraftAfterId(undefined)}
                    />
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Panel>

          {!focus ? (
          <>
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
                    <ModelErrorNote error={attempt.error} status={attempt.status} />
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0">风险原因：</span>
                <ReasonList codes={riskReasons} />
              </div>
              <div className="text-muted-foreground">建议：核对原图与识别明细，点击单元格修正后逐行确认。</div>
              <Button size="sm" variant="primary" onClick={() => setRiskOpen(true)}>查看风险说明</Button>
            </div>
          </Panel>
          </>
          ) : null}
        </div>
      </div>
      <RiskDetailDrawer open={riskOpen} onClose={() => setRiskOpen(false)} reasons={riskReasons} />
    </div>
  );
}

function EmptyState({ batchId, message }: { batchId: string; message: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">审核工作台</h1>
        <BatchScopeSelect batchId={batchId} />
      </div>
      <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
        {message}
      </div>
    </div>
  );
}

/**
 * 内联新增草稿行：按 field-schema 渲染可编辑字段，本地 state 驱动。
 * 商品名称（name）为必填，未填时禁用保存（与 validateRow 的 INVALID_PRODUCT_NAME 规则一致）。
 * 列结构与明细表对齐：行号 + 各字段 + 状态/标识类别（合并占位）+ 操作。
 */
function DraftRow({
  fields,
  isPending,
  onSave,
  onCancel,
}: {
  fields: FieldDef[];
  isPending: boolean;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const nameFilled = (values.name ?? "").trim().length > 0;
  return (
    <tr className="bg-primary/5">
      <td className={tableCellClass}>
        <span className="inline-flex items-center rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          新
        </span>
      </td>
      {fields.map((field) => (
        <td key={field.key} className={cn(tableCellClass, "p-1")}>
          {field.editable ? (
            <input
              type={field.type === "number" ? "number" : "text"}
              step={field.type === "number" ? "any" : undefined}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
              placeholder={field.label}
              autoFocus={field.key === "name"}
              className={cn(
                "h-7 w-full min-w-16 rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary",
                (field.align ?? (field.type === "number" ? "right" : "left")) === "right" && "text-right",
              )}
            />
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      ))}
      <td className={tableCellClass} colSpan={2}>
        <span className="text-[11px] text-muted-foreground">待保存</span>
      </td>
      <td className={tableCellClass}>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="primary"
            onClick={() => onSave(values)}
            disabled={isPending || !nameFilled}
            title={nameFilled ? "保存新行" : "请先填写商品名称"}
          >
            <Check size={14} />保存
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
            <X size={14} />取消
          </Button>
        </div>
      </td>
    </tr>
  );
}
