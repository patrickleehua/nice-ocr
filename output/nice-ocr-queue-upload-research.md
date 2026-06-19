# nice-ocr 队列入口 & 上传来源标识 — Research

> 阶段: research（Super Dev 流水线 / evolve）
> 更新: 2026-06-19
> 范围: 两个需求点 —— (1) 顶部导航栏队列/上传图片整理 + 队列可视化与维护入口；(2) PDF/ZIP 上传的来源标识与可追溯。
> 本地知识引擎: 仓库无 `knowledge/`、无 `output/knowledge-cache/*-knowledge-bundle.json`，本次无本地知识命中，结论以现有代码勘察 + 通用同类产品模式为准。

---

## 1. 需求复述（来自用户）

**问题 1 — 导航栏右侧「队列 / 上传图片」**
- 「上传图片」按钮可以删除。
- 「队列」目前没有一个合理的入口能看到队列中实际的情况；需要补上"查看 + 维护队列"的功能。

**问题 2 — PDF / ZIP 上传缺乏来源标识维护**
- 上传 PDF 应当分页，且每一页要有"前缀标识"指明它属于哪一份原始文件。
- 能看到"具体的"来源（哪份文件、第几页）。
- ZIP 同理；并且 **ZIP 里包含 PDF** 等嵌套情况都要考虑到。

---

## 2. 现状勘察（基于真实代码）

### 2.1 顶部导航栏（`src/components/app-shell/app-shell.tsx`）
顶栏右侧目前有两个元素：

| 元素 | 代码位置 | 现状 |
| --- | --- | --- |
| 队列状态药丸 | L179–182 | 纯展示 `<div>`，按 `summary.metrics.queued` 显示「队列处理中 N / 队列空闲」，**不可点击**，点不进任何队列详情。 |
| 「上传图片」按钮 | L183–188 | `<Link>` 指向 `/batches/${activeBatchId}`，`activeBatchId = batches[0]?.id`（列表第一个批次，语义随意）。 |

**问题确认：**
- 「上传图片」是冗余且语义不清的入口：① 上传本质上必须落到某个批次，全局"上传到第一个批次"不合理；② 实际还支持 PDF/ZIP，叫"上传图片"误导；③ 上传能力在 [批次列表页](../nice-ocr/src/components/batches/batches-page.tsx)（每行「上传」）和 [批次详情页](../nice-ocr/src/components/batches/batch-detail-page.tsx)（「上传文件」）已具备。→ **可删除**。
- 队列药丸只有一个计数，**没有任何下钻**。系统里 `RecognitionJob` 表承载真实队列，却没有任何页面/接口能列出它。

### 2.2 队列机制（已有，但无可视化）
- 数据模型 `RecognitionJob`（`prisma/schema.prisma` L59–80）：`type`(extract/second_pass/consensus/audit)、`status`(queued/active/completed/failed)、`priority`、`attemptsMade`/`maxAttempts`、`nextRunAt`、`lockedAt`/`lockedBy`、`lastError`、时间戳。
- Worker（`scripts/worker.ts`）：`claimNextJob` 乐观锁领取 → 处理 → 落 completed / 重排队 / failed；`reclaimStaleJobs` 回收孤儿 active。
- **缺口：**
  - 无任何 `GET /api/queue|jobs` 列表接口；`dashboard/summary` 只对 queued 做 `count`。
  - 无队列页面；`JobStatusBadge`（`src/components/ui/status.tsx` L70）组件已存在却**无人使用**。
  - 仅有"按单个文档重试"（`POST /api/documents/[id]/retry`），没有"按 job 维度"的重试/取消/清理。
- 结论：队列的"后端事实"完整，缺的是**只读列表接口 + 维护动作接口 + 一个队列页面 + 顶栏可点击入口**。

### 2.3 上传 / Ingest 链路（来源信息在此被丢弃）
`src/lib/files/ingest.ts` → `ingestUploadStream(name, buffer, mime)` 把上传统一展开为"可识别图片"：

| 输入 | 处理 | 产出 name | 丢失的信息 |
| --- | --- | --- | --- |
| 图片 | 原样透传 | 原文件名 | — |
| PDF | 逐页渲染 PNG | `${pdf去扩展名}-p{页码}.png` | 只剩一个**派生文件名**，无结构化"来源=PDF/第几页/共几页" |
| ZIP | 解压后逐条：图片透传 / PDF 逐页渲染 | 图片=条目名；PDF 页=`${内部pdf名}-p{页}.png` | **完全丢失 ZIP 文件名与条目路径**；ZIP→PDF 页只剩 `内部pdf-p2.png` |

下游 `POST /api/batches/[id]/upload` 把每个 `IngestedImage` 落成一条 `Document`，`originalName = image.name`。`Document` 现有字段里 `tag` / `width` / `height` 均**未使用**。

**问题确认：**
- 来源信息只能"从文件名猜"，极其脆弱：真有一个文件就叫 `发票-p3.png` 时无法与"PDF 第 3 页"区分。
- ZIP 上下文整体丢失：两个不同 ZIP 各含 `发票.pdf` 时，界面上无法区分来自哪个压缩包、哪个目录。
- 没有"页码 / 总页数 / 条目路径"的结构化字段，无法做"前缀标识"和"看具体来源"。

### 2.4 文档展示现状
- [批次详情页](../nice-ocr/src/components/batches/batch-detail-page.tsx) 文件列表列：文件名 / 状态 / 风险 / 更新时间 / 操作；预览面板只显示状态/风险/更新时间。**无"来源"维度**。
- `GET /api/batches/[id]`（含 documents）直接返回 Document 全字段——加了新字段即可透出。

---

## 3. 同类产品模式参考（通用最佳实践）

- **批处理队列页（如各类 OCR / ETL / CI 控制台）**：统一的"任务/作业列表"，列含 作业类型、状态徽章、所属对象、尝试次数 N/上限、最近错误、入队/更新时间；支持按状态筛选、自动刷新（轮询）、失败重试、排队取消、成功清理。本仓库 `RecognitionJob` 字段已能 1:1 支撑该模式。
- **文档来源溯源（如 PDF 拆页 / 压缩包导入工具）**：每个派生页保留"源文件名 + 页码/总页数（+ 压缩包内路径）"，列表用 **徽章 + 前缀**呈现，并可按源文件分组折叠。嵌套（ZIP→PDF）用层级路径 `档案.zip › 发票.pdf · 第2/5页` 表达。
- **键设计**：来源用**结构化列**（type/file/entry/page）承载，绝不依赖文件名解析；展示层再从结构化列渲染徽章。

---

## 4. 关键发现 & 设计约束（继承到 PRD/架构/UIUX）

1. **队列后端事实已完整**，只缺读接口 + 维护动作 + 页面 + 入口；优先复用 `RecognitionJob` 与现有 `JobStatusBadge`。
2. **来源信息必须结构化落库**，不能靠文件名反推。新增 `Document` 字段：`sourceType / sourceFile / sourceEntry / pageNumber / pageCount`，全部可空/带默认 → **向后兼容**（旧数据 `sourceType` 默认 `image`）。
3. `pdf-to-img@6.2.0` 的 `Pdf.length` 即总页数（已核类型定义），可填 `pageCount`；逐页 `index` 填 `pageNumber`。
4. **嵌套场景**枚举齐全：`image`（直传图片）、`pdf`（直传 PDF 的页）、`zip-image`（ZIP 内图片）、`zip-pdf`（ZIP 内 PDF 的页）。`zip-pdf` 同时保留 `sourceFile=压缩包名`、`sourceEntry=zip内pdf路径`、`pageNumber/pageCount`。
5. **前后端路径常量**集中在 `src/lib/api/paths.ts`，新接口必须登记，避免漂移。
6. **图标/设计 token 复用现有体系**：图标用 `lucide-react`（已装），颜色用 `globals.css` 既有 token（primary #2563eb、success/warning/danger/info 及 *-soft 变体），徽章用现有 `Badge`/`status.tsx` 体系。禁 emoji、禁紫粉渐变。
7. **删除「上传图片」**后，把队列药丸改造成 `<Link>` 指向 `/queue`，并在侧栏「系统」分组补「队列」入口，保证可达性。

---

## 5. 风险与注意点

- 新增 Document 列需一次 `prisma migrate`/`db push`；sqlite 加可空列安全。需同步 `npm run db:generate`（见记忆：运行前先 `prisma generate`）。
- 队列页自动刷新用 react-query `refetchInterval`，注意页面卸载停止轮询，避免空转。
- "取消排队 job"要同时把对应 `Document.status` 收敛到合理态（如 `cancelled`/保持 `queued`），避免出现"job 没了但文档永远卡 queued"。
- 重试 job 必须避免与 worker 的乐观锁/孤儿回收冲突：仅允许重试 `failed`（或 `completed` 重跑），不动 `active`。
- 测试走隔离 `test.db`（见记忆：`npm test` → `scripts/test.ts`）。
