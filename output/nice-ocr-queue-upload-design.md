# nice-ocr 队列入口 & 上传来源标识 — 设计（PRD / 架构 / UIUX 增量）

> 阶段: docs（Super Dev 流水线 / evolve）— 三份核心文档以**增量**形式叠加在全量
> `output/nice-ocr-prd.md`、`-architecture.md`、`-uiux.md` 之上。
> 更新: 2026-06-19 ｜ 配套: `nice-ocr-queue-upload-research.md`
> 门禁: 本文档完成后**暂停**，等待用户确认后才创建 Spec / 写代码。

---

# 一、PRD 增量

## 1.1 目标
1. 清理顶栏：删除语义不清的「上传图片」按钮；把「队列」做成真正可下钻、可维护的功能。
2. 让 PDF/ZIP 上传后每个文档都能**一眼看出来源**（哪份文件、第几页、压缩包内哪条），并覆盖 ZIP 套 PDF 的嵌套情况。

## 1.2 用户故事
- US-1：作为操作员，我点顶栏「队列」能进入队列页，看到所有识别作业的类型/状态/所属批次与文档/尝试次数/错误，并能筛选与自动刷新。
- US-2：作为操作员，对失败的作业我能一键重试，对还在排队的作业我能取消，对已完成的我能清理，保持队列干净。
- US-3：作为操作员，上传一个 10 页 PDF 后，文件列表里每条都显示「PDF · 发票.pdf · 第 3/10 页」这样的来源徽章与前缀。
- US-4：作为操作员，上传 ZIP（含图片与 PDF）后，能区分每个文档来自哪个压缩包、压缩包内哪条路径；ZIP 内 PDF 的页显示「ZIP›PDF · 档案.zip › 发票.pdf · 第 2/5 页」。

## 1.3 功能需求
**FR-A 顶栏 & 队列入口**
- FR-A1 删除顶栏「上传图片」按钮。
- FR-A2 顶栏队列药丸改为可点击，跳 `/queue`；空闲/处理中状态色保留。
- FR-A3 侧栏「系统」分组新增「队列」导航项（图标 `ListChecks`）。

**FR-B 队列页 `/queue`**
- FR-B1 列表展示作业：类型、状态徽章、所属批次（可跳批次详情）、文档名（带来源徽章）、尝试 N/上限、最近错误（截断+悬浮全文）、入队时间、更新时间。
- FR-B2 顶部状态分组统计 + 按状态/类型筛选 + 分页。
- FR-B3 自动刷新（默认 5s 轮询，可手动刷新；页面隐藏/卸载停止）。
- FR-B4 维护动作：失败作业「重试」、排队作业「取消」、「重试全部失败」、「清理已完成」。
- FR-B5 空态/加载态/错误态符合现有页面规范。

**FR-C 上传来源结构化**
- FR-C1 ingest 为每个产出图片附带来源元数据：`kind / uploadName / entryPath / pageNumber / pageCount`。
- FR-C2 upload 落库时写入 `Document` 新字段 `sourceType/sourceFile/sourceEntry/pageNumber/pageCount`。
- FR-C3 覆盖四类来源：`image`、`pdf`、`zip-image`、`zip-pdf`。

**FR-D 来源展示**
- FR-D1 批次详情文件列表新增「来源」列，用 `SourceBadge` 呈现；文件名列保留派生名作为前缀标识。
- FR-D2 批次详情预览面板补充"来源"信息（源文件 / 页码 / 压缩包路径）。
- FR-D3 队列页文档名旁同样复用 `SourceBadge`（轻量版）。

## 1.4 非目标（本次不做）
- 不做 PDF 在线翻页阅读器、不做 ZIP 目录树浏览器、不做按源文件分组折叠的复杂视图（仅"来源列 + 可按来源排序"）。
- 不重构 worker 调度算法；不引入新队列中间件。
- 不改识别/审核业务逻辑。

## 1.5 验收标准
- 顶栏无「上传图片」；点队列药丸或侧栏「队列」进入 `/queue` 并看到真实作业。
- 失败作业可重试并在轮询后状态更新；排队作业可取消且对应文档状态收敛合理。
- 上传 10 页 PDF → 10 条文档，每条来源徽章正确显示「第 i/10 页」与源文件名。
- 上传含 PDF 的 ZIP → ZIP 内 PDF 各页来源为 `zip-pdf` 且压缩包名/内部路径/页码齐全。
- `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 全绿；运行期 smoke 通过。

---

# 二、架构增量

## 2.1 数据模型（`prisma/schema.prisma` → `Document`）
新增 5 个字段（全部可空/带默认，向后兼容）：
```prisma
model Document {
  // ...existing...
  sourceType  String  @default("image") // image | pdf | zip-image | zip-pdf
  sourceFile  String?                    // 原始上传文件名（发票.pdf / 档案.zip / 单张.jpg）
  sourceEntry String?                    // ZIP 内条目路径（zip-image / zip-pdf）
  pageNumber  Int?                       // PDF/zip-pdf 的 1-based 页码
  pageCount   Int?                       // 该 PDF 总页数
  // @@index 保持不变；如需按来源筛选可加 @@index([sourceType])
}
```
- 迁移：`npm run db:generate` + `prisma db push`（sqlite 加可空列安全）；旧数据 `sourceType` 落为默认 `image`。

## 2.2 Ingest 层（`src/lib/files/ingest.ts`）
扩展产出结构，把来源元数据贯穿到流式产出：
```ts
export type IngestSourceKind = "image" | "pdf" | "zip-image" | "zip-pdf";
export interface IngestSource {
  kind: IngestSourceKind;
  uploadName: string;          // 顶层上传文件名
  entryPath?: string;          // zip 内路径
  pageNumber?: number;         // pdf / zip-pdf
  pageCount?: number;          // 该 pdf 总页数（来自 pdf-to-img 的 Pdf.length）
}
export interface IngestedImage {
  name: string; buffer: Buffer; mimeType: string;
  source: IngestSource;        // 新增
}
```
- `renderPdfPages` 接收 `(displayName, buffer, source: 基础来源)`，用 `doc.length` 作 `pageCount`，逐页补 `pageNumber`。
- 顶层 PDF → `kind:"pdf", uploadName: 文件名`；ZIP 内图片 → `kind:"zip-image", uploadName: zip名, entryPath`；ZIP 内 PDF → `kind:"zip-pdf", uploadName: zip名, entryPath, pageNumber/pageCount`；直传图片 → `kind:"image"`。
- `name`（派生显示名/存储扩展名）规则不变，保证存储与 hash 行为稳定。

## 2.3 Upload 路由（`src/app/api/batches/[id]/upload/route.ts`）
落库 `prisma.document.create` 时，从 `image.source` 写入 5 个新字段；其余逻辑（流式、失败跳过、入队）不变。

## 2.4 队列接口（新增）
| 方法 & 路径 | 作用 | 说明 |
| --- | --- | --- |
| `GET /api/queue` | 队列列表 | query: `status`、`type`、`page`、`pageSize`；返回 job + `document{ id, originalName, sourceType, sourceFile, sourceEntry, pageNumber, pageCount }` + `batch{ id, name }`，以及各状态计数 `counts`。 |
| `POST /api/queue/[id]/retry` | 重试单作业 | 仅允许 `failed`（可选 `completed` 重跑）：重置 `status=queued, attemptsMade=0, lastError=null, nextRunAt=now`，并把 `Document.status` 收敛为 `queued`。 |
| `POST /api/queue/[id]/cancel` | 取消单作业 | 仅允许 `queued`：删除该 job（或置 `cancelled`），`Document.status` 收敛为 `cancelled`。 |
| `POST /api/queue/retry-failed` | 批量重试失败 | 批次内/全局所有 `failed` → `queued`。 |
| `POST /api/queue/clear-completed` | 清理已完成 | 删除 `completed` 作业（不动文档与识别结果）。 |
- 统一走现有 `handleRoute` + `zod` 校验（参考 `src/lib/api/http.ts`、`batches/route.ts`）。
- 写操作记审计 `AuditLog`（entityType `RecognitionJob`），与现有审计风格一致。
- `src/lib/api/paths.ts` 新增：`queue`、`queueRetry(id)`、`queueCancel(id)`、`queueRetryFailed`、`queueClearCompleted`。
- 队列读写逻辑抽到 `src/lib/queue/`（如 `queue/list.ts`、扩展 `queue/jobs.ts`），路由保持薄。

## 2.5 一致性 / 并发
- 重试/取消用条件 `updateMany`（带 `status` 前置条件）做乐观更新，避免与 worker `claimNextJob`/`reclaimStaleJobs` 竞态；不操作 `active`。
- 取消即删除 job 时，保留 `Document` 及其已产出 rows（若有）；文档状态置 `cancelled` 以便后续可在批次详情重试。

## 2.6 受影响文件清单
- 改：`prisma/schema.prisma`、`src/lib/files/ingest.ts`、`src/app/api/batches/[id]/upload/route.ts`、`src/lib/api/paths.ts`、`src/components/app-shell/app-shell.tsx`、`src/components/batches/batch-detail-page.tsx`、`src/components/ui/status.tsx`(可能加 SourceBadge 或新建)。
- 增：`src/app/api/queue/route.ts`、`src/app/api/queue/[id]/retry/route.ts`、`src/app/api/queue/[id]/cancel/route.ts`、`src/app/api/queue/retry-failed/route.ts`、`src/app/api/queue/clear-completed/route.ts`、`src/lib/queue/list.ts`、`src/app/queue/page.tsx`、`src/components/queue/queue-page.tsx`、`src/components/ui/source-badge.tsx`、相关 `__tests__`。

---

# 三、UIUX 增量

## 3.1 设计 token / 图标（锁定，沿用现有体系）
- 图标库：`lucide-react@1.20`（已装）。新增用到：`ListChecks`（队列导航/页面）、`RotateCcw`（重试，已用）、`Ban`/`XCircle`（取消）、`Trash2`（清理）、`RefreshCw`（手动刷新）、`FileText`(PDF)、`FileArchive`(ZIP)、`Image`(图片)。**全部来自 lucide，无 emoji。**
- 颜色：仅用 `globals.css` 既有 token —— `primary #2563eb`、`success/warning/danger/info` 及 `*-soft` 软底；徽章复用 `Badge` 组件 tone 体系。无紫粉渐变、无默认系统字体直出（沿用 Inter/Noto Sans SC）。
- 字体层级 / 间距 / 卡片：复用现有 `Panel`/`TableWrap`/`DataTable`/`Pagination`/页面 `space-y-4` 骨架，保持与批次/结果页一致。

## 3.2 顶栏改造（`app-shell.tsx`）
- 删除「上传图片」`<Button asChild><Link>…</Link></Button>` 整块。
- 队列药丸：`<div>` → `<Link href="/queue">`，hover 态加 `hover:bg-muted`；保留圆点（queued>0 → warning，否则 success）与文案「队列处理中 N / 队列空闲」。
- 侧栏「系统」分组 items 增加 `{ href: "/queue", label: "队列", icon: ListChecks }`（排在「导入」前或后）。

## 3.3 队列页 `/queue`
- 页头：标题「识别队列」+ 副标题；右侧动作区「刷新」「重试全部失败」「清理已完成」按钮（次要/幽灵样式）。
- 状态概览条：queued / active / failed / completed 计数小卡（复用现有边框卡风格，颜色用对应 token-soft）。
- 筛选条：状态下拉、类型下拉（沿用 batches 页筛选条样式）。
- 主表（`DataTable`）列：作业类型 ｜ 状态(`JobStatusBadge`) ｜ 批次(链接) ｜ 文档(名 + `SourceBadge`) ｜ 尝试(N/上限) ｜ 最近错误(截断, `title` 全文) ｜ 入队时间 ｜ 更新时间 ｜ 操作。
- 操作列：`failed`→「重试」(`RotateCcw`)；`queued`→「取消」(`Ban`)；`active`→禁用占位（不可操作）。
- 自动刷新：react-query `refetchInterval: 5000`；页头放刷新中指示。空态「队列为空」。

## 3.4 来源徽章 `SourceBadge`（新增组件）
按 `sourceType` 渲染（图标 + 文案 + tone）：
| sourceType | 展示 | 图标 / tone |
| --- | --- | --- |
| `image` | `图片` | `Image` / neutral |
| `pdf` | `PDF · {sourceFile} · 第{pageNumber}/{pageCount}页` | `FileText` / info |
| `zip-image` | `ZIP · {sourceFile} › {sourceEntry}` | `FileArchive` / neutral |
| `zip-pdf` | `ZIP›PDF · {sourceFile} › {内部pdf名} · 第{pageNumber}/{pageCount}页` | `FileArchive`+`FileText` / info |
- 列表中长文案截断 + `title` 悬浮全文；紧凑变体（仅图标+「第i/N页」）用于队列页。

## 3.5 批次详情页（`batch-detail-page.tsx`）
- 文件列表「文件名」列后插入「来源」列 → `SourceBadge`；文件名本身（如 `发票-p3.png`）天然作为前缀标识。
- 预览面板 `dl` 增加「来源」「页码」「压缩包路径」（按 sourceType 条件显示）。
- `ApiDoc` 接口补充 5 个来源字段。

## 3.6 交互状态
- 重试/取消/批量动作：按钮 `disabled` + pending 文案；成功后 `invalidate` 队列与 dashboard 查询；失败显示 `text-danger` 错误。
- 无障碍：药丸/动作按钮补 `aria-label`/`title`；徽章不依赖颜色单独表意（带文字）。

---

## 四、实施里程碑（每个里程碑结束 `git commit`）
> 顺序兼顾"前端优先 + 运行验证"，但 provenance/队列依赖后端数据，采用"接口先行→页面验证"的最小闭环。

- **M1 队列后端**：`GET /api/queue` + retry/cancel/retry-failed/clear-completed + `paths.ts` + `lib/queue/list.ts` + 单测。→ commit
- **M2 队列页 + 顶栏**：`/queue` 页面与组件、顶栏删「上传图片」+ 药丸链接化 + 侧栏「队列」入口；运行期 smoke。→ commit
- **M3 来源后端**：schema 迁移 + ingest provenance + upload 落库 + ingest 单测（四类来源/嵌套）。→ commit
- **M4 来源展示**：`SourceBadge` + 批次详情来源列/预览 + 队列页徽章；运行期 smoke + UI 自检（无 emoji / token 合规）。→ commit
- 收尾：typecheck / lint / test / build 全绿，质量自检。

## 五、待确认项 — 已在确认门定稿（2026-06-19）
1. 取消排队作业 → **删除 job + 文档置 `cancelled`**（已确认）。
2. 队列页范围 → **全局所有批次 + 可筛选**（已确认）。
3. 批量动作 → **仅「重试全部失败」**；不做「清理已完成」（已确认）。
4. ZIP 内路径过长 → 列表显示末段文件名，`title` 悬浮全路径（沿用建议）。
