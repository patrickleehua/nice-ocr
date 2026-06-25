"use client";

import { Boxes, Check, ChevronLeft, ChevronRight, Columns3, LocateFixed, LocateOff, Maximize2, Minimize2, Plus, Search, ShieldCheck, Trash2, Wand2, X } from "lucide-react";
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
import type { ImageRegion } from "@/components/ui/image-viewer";
import { BatchWorkspaceNav } from "@/components/batches/batch-workspace-nav";
import { BatchScopeSelect } from "@/components/batches/batch-scope-select";
import { useSidebar } from "@/components/app-shell/sidebar-context";
import { cn, formatDateTime } from "@/lib/utils";
import { RiskDetailDrawer } from "@/components/dialogs/action-dialogs";
import { DEFAULT_SCENARIO_ID, fieldCellWidthClass, getScenarioFields, isCoreColumn, type FieldDef } from "@/lib/fields/field-schema";
import { useFieldSchema } from "@/lib/fields/use-field-schema";
import { matchLibraryCandidates, normalizeMatchKey, type NameCandidate } from "@/lib/products/match";
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
  sourceRegionJson?: string | null;
  /** 副模型对该行读到的商品名（与主模型不同时由接口附带），作为审核台一键候选。 */
  altName?: string | null;
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

// 词语联想 <datalist> 元素 id（item 1）：明细表与新增草稿行的商品名/单位输入共用。
const SUGGEST_NAMES_ID = "review-suggest-names";
const SUGGEST_UNITS_ID = "review-suggest-units";

/** 文本字段对应的联想 datalist id（仅可编辑的商品名/单位）。 */
function fieldListId(field: FieldDef): string | undefined {
  if (!field.editable) return undefined;
  if (field.key === "name") return SUGGEST_NAMES_ID;
  if (field.key === "unit") return SUGGEST_UNITS_ID;
  return undefined;
}

function rowSourceRegion(row: ApiRow): ImageRegion["box"] | null {
  if (!row.sourceRegionJson) return null;
  try {
    const parsed = JSON.parse(row.sourceRegionJson) as { box?: Partial<ImageRegion["box"]> };
    const box = parsed.box;
    if (!box) return null;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    const safeX = Math.min(1, Math.max(0, x));
    const safeY = Math.min(1, Math.max(0, y));
    const safeW = Math.min(1 - safeX, Math.max(0, w));
    const safeH = Math.min(1 - safeY, Math.max(0, h));
    if (safeW <= 0 || safeH <= 0) return null;
    return { x: safeX, y: safeY, w: safeW, h: safeH };
  } catch {
    return null;
  }
}

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
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  // 每个文档只恢复一次"上次审核到的行"，避免编辑刷新后反复抢滚动（item 4 行级增强）。
  const restoredDocRef = useRef<string | null>(null);
  // 每个文档只打一次处理计时起点（task 1）。
  const reviewStartedDocs = useRef<Set<string>>(new Set());
  // 列显示偏好：被隐藏的字段列 key 集合，持久化到 localStorage。
  const [hiddenFieldKeys, setHiddenFieldKeys] = useState<Set<string>>(new Set());
  // 单行数据定位开关：开=点击/悬停行可在原图定位并高亮，关=纯查看不联动、原图不画框。
  const [locateEnabled, setLocateEnabled] = useState(true);
  // 列宽（item 2）：字段 key → 用户拖拽设定的像素宽度，持久化到 localStorage。
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const widthsHydrated = useRef(false);
  const resizing = useRef<{ key: string; startX: number; startW: number } | null>(null);
  // 上次审核到的文档（item 4）：按作用域记忆，进入时定位到此而非第一张。
  const [storedLastId, setStoredLastId] = useState<string | null>(null);

  // 挂载后读取持久化偏好（初值取默认，避免 SSR/CSR 水合不一致）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawCols = window.localStorage.getItem("review-hidden-cols");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后读取持久化偏好，水合安全
      if (rawCols) setHiddenFieldKeys(new Set(JSON.parse(rawCols) as string[]));
      const rawWidths = window.localStorage.getItem("review-col-widths");
      if (rawWidths) setColWidths(JSON.parse(rawWidths) as Record<string, number>);
    } catch {
      /* 忽略损坏的本地偏好 */
    }
    widthsHydrated.current = true;
    if (window.localStorage.getItem("review-locate-enabled") === "0") {
      setLocateEnabled(false);
    }
  }, []);

  function toggleColumn(key: string) {
    setHiddenFieldKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (typeof window !== "undefined") window.localStorage.setItem("review-hidden-cols", JSON.stringify([...next]));
      return next;
    });
  }

  function toggleLocate() {
    setLocateEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") window.localStorage.setItem("review-locate-enabled", next ? "1" : "0");
      return next;
    });
  }

  // 列宽拖拽（item 2）：按下记录起始宽度，移动实时更新，松手结束；通过 pointer capture
  // 让拖到表头外也持续响应。持久化由下方 effect 跟随 colWidths 写入。
  function startResize(event: React.PointerEvent, key: string) {
    const th = event.currentTarget.parentElement as HTMLElement | null;
    const startW = th?.getBoundingClientRect().width ?? 120;
    resizing.current = { key, startX: event.clientX, startW };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveResize(event: React.PointerEvent) {
    const state = resizing.current;
    if (!state) return;
    const next = Math.max(60, Math.min(640, Math.round(state.startW + (event.clientX - state.startX))));
    setColWidths((prev) => ({ ...prev, [state.key]: next }));
  }
  function endResize(event: React.PointerEvent) {
    if (!resizing.current) return;
    resizing.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* 指针已释放 */
    }
  }
  // 双击手柄：清除该列的手动宽度，恢复按内容自适应（item 2 增强）。
  function resetColumn(key: string) {
    setColWidths((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const resizeHandle = (key: string) => (
    <span
      onPointerDown={(event) => startResize(event, key)}
      onPointerMove={moveResize}
      onPointerUp={endResize}
      onDoubleClick={() => resetColumn(key)}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40"
      title="拖拽调整列宽，双击恢复自适应"
    />
  );

  // 持久化列宽（item 2）：水合完成后跟随 colWidths 写入；水合前不写，避免空值覆盖已存偏好。
  useEffect(() => {
    if (!widthsHydrated.current || typeof window === "undefined") return;
    try {
      window.localStorage.setItem("review-col-widths", JSON.stringify(colWidths));
    } catch {
      /* 忽略写入失败 */
    }
  }, [colWidths]);

  // 读取「上次审核到的文档」（item 4）。用全局键（跨作用域稳定），挂载时读取一次。
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const value = window.localStorage.getItem("review-last-doc");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后读取持久化偏好，水合安全
      setStoredLastId(value && value.length ? value : null);
    } catch {
      /* 忽略损坏的本地偏好 */
    }
  }, []);
  // 顶部文件条：左右拖拽横向滚动。moved 标记用于区分「拖拽」与「点击选中」，避免拖动时误选文件。
  const stripRef = useRef<HTMLDivElement | null>(null);
  const stripDrag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });

  function onStripPointerDown(event: React.PointerEvent) {
    const el = stripRef.current;
    if (!el) return;
    stripDrag.current = { active: true, startX: event.clientX, scrollLeft: el.scrollLeft, moved: false };
  }
  function onStripPointerMove(event: React.PointerEvent) {
    const el = stripRef.current;
    if (!el || !stripDrag.current.active) return;
    const dx = event.clientX - stripDrag.current.startX;
    if (Math.abs(dx) > 4) stripDrag.current.moved = true;
    el.scrollLeft = stripDrag.current.scrollLeft - dx;
  }
  function endStripDrag() {
    stripDrag.current.active = false;
  }

  // 作用域随 URL 切换时同步选中文档：带 documentId 深链则定位之，否则回到列表首项（清空旧批次的陈旧选中）。
  // render 阶段调整状态，优于 effect：避免跨批次陈旧 documentId 的一帧闪烁。
  const urlScopeKey = `${batchIdParam ?? ""}|${documentIdParam ?? ""}`;
  const [prevScopeKey, setPrevScopeKey] = useState(urlScopeKey);
  if (prevScopeKey !== urlScopeKey) {
    setPrevScopeKey(urlScopeKey);
    setOverride(documentIdParam);
  }

  // 持久化"上次审核到的文档"（item 4，全局键）。只在用户显式选择/导航/编辑时写，
  // 不在初次自动选中第一张时写，避免覆盖掉真正的上次位置。
  function rememberDoc(id: string | null) {
    if (typeof window === "undefined" || !id) return;
    try {
      window.localStorage.setItem("review-last-doc", id);
    } catch {
      /* 忽略写入失败 */
    }
  }

  function selectDoc(id: string) {
    rememberDoc(id);
    setOverride(id);
  }

  // 跨批次/单批次文档待办列表（审核数据通路）：无 batchId=全部，带 batchId=隔离到该批次。
  const { data: docList } = useQuery<{ documents: WorklistDoc[] }>({
    queryKey: ["documents", batchIdParam ?? "all"],
    queryFn: () => apiGet(batchIdParam ? `${apiPaths.documents}?batchId=${batchIdParam}` : apiPaths.documents),
  });
  const documents = useMemo(() => docList?.documents ?? [], [docList]);

  // 词语联想数据源（item 1）：从资料库取商品名/单位候选，供 <datalist> 输入联想。
  const { data: suggestData } = useQuery<{
    names: string[];
    units: string[];
    unitByName: Record<string, string>;
    nameCorrections: Record<string, string>;
    library: Array<{ name: string; unit: string | null; price: number | null }>;
  }>({
    queryKey: ["suggest"],
    queryFn: () => apiGet(apiPaths.suggest),
    staleTime: 60_000,
  });
  const suggestNames = suggestData?.names ?? [];
  const suggestUnits = suggestData?.units ?? [];
  const unitByName = useMemo(() => suggestData?.unitByName ?? {}, [suggestData]);
  const nameCorrections = useMemo(() => suggestData?.nameCorrections ?? {}, [suggestData]);
  // 产品库预归一化（一次），供模糊匹配建议复用，避免逐行重复归一。
  const matchLibrary = useMemo(
    () => (suggestData?.library ?? []).map((product) => ({ ...product, norm: normalizeMatchKey(product.name) })),
    [suggestData],
  );

  const normKey = (value: string) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "").trim();

  // 单位联想按当前行商品名给候选（task 2）：命中产品库 → 该产品单位置顶；未命中 → 用全局单位列表。
  function unitOptionsForRow(row: ApiRow): string[] | undefined {
    const matched = unitByName[normKey(row.name)];
    if (!matched) return undefined;
    return [matched, ...suggestUnits.filter((unit) => unit !== matched)];
  }

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

  // item 4：无显式选择/深链时，优先回到该作用域上次审核到的文档（仍存在才用），否则第一张。
  const fallbackDocId =
    (storedLastId && documents.some((doc) => doc.id === storedLastId) ? storedLastId : documents[0]?.id) ?? null;
  const selectedId = override ?? fallbackDocId;
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
  // 用 useMemo 稳定 rows 引用：避免每次渲染产生新数组，触发依赖它的 effect/useMemo 反复执行。
  const rows = useMemo(() => document?.rows ?? [], [document]);

  // 产品库模糊匹配候选（带置信度）：仅对未审核行算，结果随 rows / 产品库变化缓存（前端计算，不拖慢确认）。
  const libraryCandidatesByRow = useMemo(() => {
    const map = new Map<string, NameCandidate[]>();
    if (!matchLibrary.length) return map;
    for (const row of rows) {
      if (row.status === "confirmed") continue;
      const candidates = matchLibraryCandidates({ name: row.name, unit: row.unit, price: row.price }, matchLibrary);
      if (candidates.length) map.set(row.id, candidates);
    }
    return map;
  }, [rows, matchLibrary]);

  // 单元格一键候选小标：名称列给「产品库匹配(带置信度) + 副模型候选 + 历史纠正」；单位列给产品库单位。
  function cellSuggestions(row: ApiRow, field: FieldDef): Array<{ value: string; hint?: string }> | undefined {
    if (field.key === "name") {
      const out: Array<{ value: string; hint?: string }> = [];
      for (const candidate of libraryCandidatesByRow.get(row.id) ?? []) {
        out.push({ value: candidate.name, hint: `${candidate.confidence}%` });
      }
      if (row.altName) out.push({ value: row.altName, hint: "副模型" });
      const corr = nameCorrections[normKey(row.name)];
      if (corr) out.push({ value: corr, hint: "历史" });
      return out.length ? out : undefined;
    }
    if (field.key === "unit") {
      const matched = unitByName[normKey(row.name)];
      return matched ? [{ value: matched, hint: "库" }] : undefined;
    }
    return undefined;
  }
  const imageRegions = useMemo<ImageRegion[]>(
    () =>
      rows
        .map((row, index): ImageRegion | null => {
          const box = rowSourceRegion(row);
          if (!box) return null;
          return {
            id: row.id,
            label: `第 ${index + 1} 行 ${row.name}`,
            box,
            tone: row.auditState === "flagged" ? "flagged" : "active",
          };
        })
        .filter((region): region is ImageRegion => region !== null),
    [rows],
  );

  const fieldSchema = useFieldSchema({ batchId: activeDocBatchId });
  // 加载前用默认场景字段兜底，避免列结构跳变。
  const fields = fieldSchema.data?.fields ?? getScenarioFields(DEFAULT_SCENARIO_ID);
  // 应用「列显示」勾选，并把备注列后移到「标识类别」之后，让人工核对标识在首屏内可见。
  const visibleFields = useMemo(() => fields.filter((field) => !hiddenFieldKeys.has(field.key)), [fields, hiddenFieldKeys]);
  const remarkField = useMemo(() => visibleFields.find((field) => field.key === "remark") ?? null, [visibleFields]);
  const mainFields = useMemo(() => visibleFields.filter((field) => field.key !== "remark"), [visibleFields]);

  useEffect(() => {
    setActiveRowId(null);
    setTargetRowId(null);
    rowRefs.current = {};
  }, [selectedId]);

  // item 4：初次定位到上次审核的文档后，把待办列表翻到它所在页，避免停在第一页看不到当前单据。
  const pagedToResumeRef = useRef(false);
  useEffect(() => {
    if (pagedToResumeRef.current || selectedIndex < 0) return;
    pagedToResumeRef.current = true;
    setDocPage(Math.floor(selectedIndex / DOC_PAGE_SIZE) + 1);
  }, [selectedIndex]);

  // task 1：首次打开某单据时打处理计时起点（fire-and-forget，服务端 set-once）。
  useEffect(() => {
    if (!selectedId || reviewStartedDocs.current.has(selectedId)) return;
    reviewStartedDocs.current.add(selectedId);
    apiJson(apiPaths.documentReviewStart(selectedId), { method: "POST" }).catch(() => {
      /* 计时起点失败不影响审核 */
    });
  }, [selectedId]);

  // item 4 行级增强：文档打开且行加载后，滚动定位到上次审核到的行并高亮（每个文档仅一次）。
  useEffect(() => {
    if (!selectedId || rows.length === 0 || restoredDocRef.current === selectedId) return;
    restoredDocRef.current = selectedId;
    let rowId: string | null = null;
    try {
      rowId = typeof window !== "undefined" ? window.localStorage.getItem(`review-last-row:${selectedId}`) : null;
    } catch {
      rowId = null;
    }
    if (!rowId || !rows.some((row) => row.id === rowId)) return;
    const target = rowId;
    requestAnimationFrame(() => {
      rowRefs.current[target]?.scrollIntoView({ block: "center" });
      setActiveRowId(target);
    });
  }, [selectedId, rows]);

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
    rememberRow(id);
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

  // 记住当前文档"审核到的行"（item 4 行级增强）：编辑/点击行时写入，下次打开滚动定位到此。
  function rememberRow(rowId: string) {
    if (typeof window === "undefined" || !selectedId) return;
    // 编辑/点击当前文档即视为"在审核它"，一并记住文档（即使没切换文档也能恢复到这里）。
    rememberDoc(selectedId);
    try {
      window.localStorage.setItem(`review-last-row:${selectedId}`, rowId);
    } catch {
      /* 忽略写入失败 */
    }
  }

  function locateRow(row: ApiRow) {
    if (!rowSourceRegion(row)) return;
    setActiveRowId(row.id);
    setTargetRowId(`${row.id}:${Date.now()}`);
  }

  function clickRow(row: ApiRow, target: EventTarget | null) {
    rememberRow(row.id);
    if (!rowSourceRegion(row)) return;
    if (target instanceof HTMLElement && target.closest("button,input,select,textarea,a")) {
      setActiveRowId(row.id);
      return;
    }
    locateRow(row);
  }

  function selectRegion(rowId: string) {
    setActiveRowId(rowId);
    rowRefs.current[rowId]?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      // 键盘切换也记住"上次审核到的文档"（直接写，避免把组件函数引入 effect 依赖）。
      const persist = (id: string) => {
        try {
          window.localStorage.setItem("review-last-doc", id);
        } catch {
          /* 忽略写入失败 */
        }
      };
      if (event.key === "ArrowLeft" && selectedIndex > 0) {
        event.preventDefault();
        const id = filteredDocs[selectedIndex - 1].id;
        persist(id);
        setOverride(id);
      } else if (event.key === "ArrowRight" && selectedIndex < filteredDocs.length - 1) {
        event.preventDefault();
        const id = filteredDocs[selectedIndex + 1].id;
        persist(id);
        setOverride(id);
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
            <p className="mt-1 text-sm text-muted-foreground">顶部选择文件（可左右拖拽滑动）、左侧查看原图（可缩放/拖拽）、右侧点击单元格直接修改识别结果。</p>
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

      {/* 文件条 —— 仅普通模式置于顶部，可左右拖拽横向滚动；专注模式用顶部精简控制条 + 快速跳转切换 */}
      {!focus ? (
        <Panel className="flex flex-col">
          <PanelHeader>
            <PanelTitle>文件</PanelTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-2 text-sm">
                <Search size={14} className="text-muted-foreground" />
                <input
                  value={docSearch}
                  onChange={(event) => {
                    setDocSearch(event.target.value);
                    setDocPage(1);
                  }}
                  placeholder="搜索文件名"
                  className="h-full w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
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
              <span className="text-xs text-muted-foreground">{filteredDocs.length} 个</span>
            </div>
          </PanelHeader>
          <div className="flex items-center gap-2 p-3">
            <button
              className="h-7 shrink-0 rounded border border-border bg-surface px-2 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => setDocPage((current) => Math.max(1, current - 1))}
              disabled={safeDocPage <= 1}
              title="上一页"
            >
              <ChevronLeft size={14} />
            </button>
            {pagedDocs.length ? (
              <div
                ref={stripRef}
                onPointerDown={onStripPointerDown}
                onPointerMove={onStripPointerMove}
                onPointerUp={endStripDrag}
                onPointerLeave={endStripDrag}
                className="flex flex-1 cursor-grab gap-2 overflow-x-auto pb-1 active:cursor-grabbing"
              >
                {pagedDocs.map((doc) => {
                  const badge = docStateBadge[doc.reviewState];
                  return (
                    <button
                      key={doc.id}
                      onClick={() => {
                        // 拖拽产生的位移不应触发选中（仅纯点击选中文件）。
                        if (stripDrag.current.moved) return;
                        selectDoc(doc.id);
                      }}
                      className={`w-56 shrink-0 rounded-md border px-2.5 py-2 text-left transition-colors ${
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
                })}
              </div>
            ) : (
              <div className="flex-1 px-2 py-4 text-center text-xs text-muted-foreground">没有符合条件的文档</div>
            )}
            <button
              className="h-7 shrink-0 rounded border border-border bg-surface px-2 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={() => setDocPage((current) => Math.min(docTotalPages, current + 1))}
              disabled={safeDocPage >= docTotalPages}
              title="下一页"
            >
              <ChevronRight size={14} />
            </button>
            <span className="shrink-0 text-[11px] text-muted-foreground">{safeDocPage} / {docTotalPages}</span>
          </div>
        </Panel>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          focus
            ? // 专注模式固定视口高度（非 min-h），使两列等高、明细内部滚动、原图垂直居中；
              // 否则表格内容会撑开行高，导致 flex-1+overflow 失效（明细过长、原图被推到底部）。
              "h-[calc(100vh-9.5rem)] min-h-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
            : // 普通模式同样给定定高，使「原图」与「识别明细」两列左右等高对齐、明细内部滚动；
              // 识别尝试/风险详情移到整组下方，故此处只放这两列。
              "min-h-[560px] xl:h-[calc(100vh-15rem)] xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]",
        )}
      >
        {/* 列 1：原图预览（可缩放 + 拖拽平移） */}
        <Panel className="flex min-h-0 flex-col">
          {/* 固定表头高度 h-14，使其与右侧「识别明细」表头底部的分隔线左右对齐 */}
          <PanelHeader className="h-14 shrink-0">
            <PanelTitle className="truncate">{document?.originalName ?? "单据预览"}</PanelTitle>
            {document ? <RiskBadge risk={document.riskLevel} /> : null}
          </PanelHeader>
          <ImageViewer
            className="flex-1"
            src={selectedId ? apiPaths.documentImage(selectedId) : null}
            alt={document?.originalName ?? "单据原图"}
            regions={locateEnabled ? imageRegions : []}
            activeRegionId={activeRowId}
            targetRegionId={targetRowId}
            onRegionSelect={selectRegion}
          />

        </Panel>

        <div className="flex min-h-0 min-w-0 flex-col">
          <Panel className="flex min-h-0 flex-1 flex-col">
            <PanelHeader className="h-14 shrink-0">
              <PanelTitle>识别明细</PanelTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{rows.length} 行 · 点击单元格可编辑</span>
                <ColumnMenu fields={fields} hidden={hiddenFieldKeys} onToggle={toggleColumn} />
                <Button
                  size="sm"
                  variant={locateEnabled ? "primary" : "secondary"}
                  onClick={toggleLocate}
                  title={
                    locateEnabled
                      ? "数据定位已开启：点击/悬停行可在原图定位高亮；点此关闭"
                      : "数据定位已关闭：点此开启，恢复点击行在原图定位"
                  }
                >
                  {locateEnabled ? <LocateFixed size={14} /> : <LocateOff size={14} />}数据定位
                </Button>
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
            <div className="min-h-0 flex-1 overflow-auto">
              <datalist id={SUGGEST_NAMES_ID}>
                {suggestNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <datalist id={SUGGEST_UNITS_ID}>
                {suggestUnits.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
              <DataTable>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableCellClass}>行</th>
                    {mainFields.map((field) => (
                      <th
                        key={field.key}
                        className={cn(tableCellClass, "relative")}
                        style={
                          colWidths[field.key]
                            ? { width: colWidths[field.key], minWidth: colWidths[field.key] }
                            : undefined
                        }
                      >
                        {field.label}
                        {resizeHandle(field.key)}
                      </th>
                    ))}
                    <th className={tableCellClass}>状态</th>
                    <th className={tableCellClass}>标识类别</th>
                    {remarkField ? (
                      <th
                        className={cn(tableCellClass, "relative")}
                        style={
                          colWidths[remarkField.key]
                            ? { width: colWidths[remarkField.key], minWidth: colWidths[remarkField.key] }
                            : undefined
                        }
                      >
                        {remarkField.label}
                        {resizeHandle(remarkField.key)}
                      </th>
                    ) : null}
                    <th className={tableCellClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? (
                    rows.map((row, index) => (
                      <Fragment key={row.id}>
                      <tr
                        ref={(node) => {
                          rowRefs.current[row.id] = node;
                        }}
                        className={cn("hover:bg-muted/40", activeRowId === row.id && "bg-warning/10")}
                        onMouseEnter={() => locateEnabled && rowSourceRegion(row) && setActiveRowId(row.id)}
                        onClick={(event) => locateEnabled && clickRow(row, event.target)}
                      >
                        <td className={tableCellClass}>{index + 1}</td>
                        {mainFields.map((field) => (
                          <FieldCell
                            key={field.key}
                            value={rowFieldValue(row, field)}
                            type={field.type === "number" ? "number" : "text"}
                            align={field.align ?? (field.type === "number" ? "right" : "left")}
                            disabled={!field.editable}
                            widthClass={fieldCellWidthClass(field, true)}
                            width={colWidths[field.key]}
                            listId={fieldListId(field)}
                            options={field.key === "unit" ? unitOptionsForRow(row) : undefined}
                            suggestions={cellSuggestions(row, field)}
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
                        {remarkField ? (
                          <FieldCell
                            value={rowFieldValue(row, remarkField)}
                            type={remarkField.type === "number" ? "number" : "text"}
                            align={remarkField.align ?? (remarkField.type === "number" ? "right" : "left")}
                            disabled={!remarkField.editable}
                            widthClass={fieldCellWidthClass(remarkField)}
                            width={colWidths[remarkField.key]}
                            listId={fieldListId(remarkField)}
                            onCommit={(next) => commitField(row.id, remarkField, next)}
                          />
                        ) : null}
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
                              {locateEnabled && rowSourceRegion(row) ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    locateRow(row);
                                  }}
                                  title="在原图中定位此行"
                                >
                                  <LocateFixed size={14} />
                                </Button>
                              ) : null}
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
                          mainFields={mainFields}
                          remarkField={remarkField}
                          isPending={createRow.isPending}
                          onSave={saveDraft}
                          onCancel={() => setDraftAfterId(undefined)}
                        />
                      ) : null}
                      </Fragment>
                    ))
                  ) : draftAfterId === null ? null : (
                    <tr>
                      <td className={tableCellClass} colSpan={4 + visibleFields.length}>
                        <span className="text-muted-foreground">{isLoading ? "加载中..." : "该文档暂无识别行"}</span>
                      </td>
                    </tr>
                  )}
                  {draftAfterId === null ? (
                    <DraftRow
                      mainFields={mainFields}
                      remarkField={remarkField}
                      isPending={createRow.isPending}
                      onSave={saveDraft}
                      onCancel={() => setDraftAfterId(undefined)}
                    />
                  ) : null}
                </tbody>
              </DataTable>
            </div>
          </Panel>
        </div>
      </div>

      {/* 识别尝试 / 风险详情：移到原图+明细两列下方，整组底部并排展示（次要信息，不占首屏） */}
      {!focus ? (
        <div className="grid gap-4 lg:grid-cols-2">
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
        </div>
      ) : null}
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
 * 列结构与明细表对齐：行号 + 主字段 + 状态/标识类别（合并占位）+ 备注（如显示）+ 操作。
 */
function DraftRow({
  mainFields,
  remarkField,
  isPending,
  onSave,
  onCancel,
}: {
  mainFields: FieldDef[];
  remarkField: FieldDef | null;
  isPending: boolean;
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const nameFilled = (values.name ?? "").trim().length > 0;
  const renderInput = (field: FieldDef, compact: boolean) => (
    <td key={field.key} className={cn(tableCellClass, "p-1")}>
      {field.editable ? (
        <input
          type={field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined}
          list={field.key === "name" ? SUGGEST_NAMES_ID : field.key === "unit" ? SUGGEST_UNITS_ID : undefined}
          value={values[field.key] ?? ""}
          onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
          placeholder={field.label}
          autoFocus={field.key === "name"}
          className={cn(
            "h-7 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary",
            fieldCellWidthClass(field, compact),
            (field.align ?? (field.type === "number" ? "right" : "left")) === "right" && "text-right",
          )}
        />
      ) : (
        <span className="text-muted-foreground">-</span>
      )}
    </td>
  );
  return (
    <tr className="bg-primary/5">
      <td className={tableCellClass}>
        <span className="inline-flex items-center rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
          新
        </span>
      </td>
      {mainFields.map((field) => renderInput(field, true))}
      <td className={tableCellClass} colSpan={2}>
        <span className="text-[11px] text-muted-foreground">待保存</span>
      </td>
      {remarkField ? renderInput(remarkField, false) : null}
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

/**
 * 列显示菜单：勾选/取消勾选明细表的字段列（如隐藏「商品编码」「单价」「金额」）。
 * 选择持久化在父组件并写入 localStorage；点击外部自动收起。
 */
function ColumnMenu({
  fields,
  hidden,
  onToggle,
}: {
  fields: FieldDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const hiddenCount = fields.filter((field) => hidden.has(field.key)).length;

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        title="选择明细表要显示的列"
      >
        <Columns3 size={14} />列显示{hiddenCount ? `（隐藏 ${hiddenCount}）` : ""}
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-border bg-surface p-1 shadow-lg">
          {fields.map((field) => {
            const visible = !hidden.has(field.key);
            return (
              <button
                key={field.key}
                type="button"
                onClick={() => onToggle(field.key)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    visible ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface",
                  )}
                >
                  {visible ? <Check size={11} /> : null}
                </span>
                <span className="truncate">{field.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
