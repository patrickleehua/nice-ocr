# Design

## Context

结果页与审核台共用一组明细组件，但「看哪个范围」是隐式的（URL 有无 `?batchId=`），且两页默认行为不一致。已有 `BatchWorkspaceNav`（概览/审核/结果三标签，带 batchId）把单批次的三个入口串成工作区；本次在此基础上补齐「可在页内选择/切换作用域」的能力，并修复字段列取全局场景导致的混批错位。

现状关键事实（用于约束设计）：
- `/api/rows` 已支持 `where.batchId` 过滤（[rows/route.ts](../../../nice-ocr/src/app/api/rows/route.ts)）。
- 审核台仅从 `/api/batches/:id` 的 `batch.documents` 取文档，结构上是单批次（[review-page.tsx](../../../nice-ocr/src/components/review/review-page.tsx)）。
- `useFieldSchema()` 拉全局活动场景，无批次/场景入参（[use-field-schema.ts](../../../nice-ocr/src/lib/fields/use-field-schema.ts)）。
- 当前仅注册了 `grocery` 一个场景（[field-schema.ts](../../../nice-ocr/src/lib/fields/field-schema.ts)），故混场景目前不会真实发生；混场景处理是面向未来多场景的兜底，今天表现为「完整列」。

## Goals / Non-Goals

Goals:
- 两页作用域显式、对称、可就地切换；默认全部。
- 选中批次 = 真隔离（数据 + 场景列 + 导出模板上下文）。
- 审核台支持跨批次待办工作流。
- 混场景下结果表不再错位。

Non-Goals:
- 不引入全局顶栏的「当前批次」上下文（方向 B，改动过大、波及无关页）。
- 不取消侧边栏「全部结果/审核工作台」入口（方向 C）。
- 不改造导出引擎本身；仅复用既有 `ExportScope`。
- 不新增第二个业务场景；只保证多场景出现时的正确性。

## Decisions

### D1 — 作用域单一事实源：URL `?batchId=`
- 取值语义：缺省或 `batchId=all`（等价空）= 全部（默认）；`batchId=<id>` = 隔离到该批次。
- 结果 ↔ 审核 互链时透传当前 `batchId`，切标签不丢作用域。
- 选中批次时渲染 `BatchWorkspaceNav`（已有逻辑：batchId 存在即显示）。
- 理由：URL 即状态，天然可分享/可回退；与现有 `BatchWorkspaceNav` 深链一致；无需全局状态。

### D2 — 共享组件 `BatchScopeSelect`
- 一个下拉：`批次：[全部 ▾ / 批次A / 批次B …]`，放在两页筛选区首位。
- 选项数据来自轻量批次列表（名称 + id，按创建时间倒序）。
- onChange → 改写 URL `?batchId`；选「全部」即移除该参数。
- 替换结果页现有的「清除批次」chip 交互（仍保留已选批次的视觉标识）。

### D3 — 隔离 = 批次工作区上下文
选中批次后：
- 结果/审核仅展示该批次数据。
- 字段列采用该批次 `scenarioId`（见 D5）。
- 结果页导出 `ExportMenu` 默认带该批次 `exportTemplateId`（与批次详情页一致）。
- 顶部显示 `BatchWorkspaceNav`（进度/封批/可导出标识）。
- 理由：用户「选批次」的心智就是「进入这个批次干活」，这与 `BatchWorkspaceNav` 的「结果/审核」标签是同一状态。

### D4 — 审核台「全部」= 跨批次待办工作流
- 新增跨批次文档列表能力：返回所有批次的文档，每条带 `batchId / batchName / reviewState / rowStats / riskLevel`，支持按 `reviewState`、文件名搜索过滤，并可传 `batchId` 收窄到单批次。
- 审核台左列在「全部」模式用该列表（多加一列/一行批次名标识）；选中批次回到单批次。
- 「上一张/下一张」「专注模式 ←/→」在当前（已过滤）文档列表内迭代，全部/隔离两模式统一。
- 「运行审核」是批次级动作：全部模式下作用于**当前所选文档所属批次**；「确认本单」是文档级，两模式通用。
- 审核台默认（无 batchId）= 全部待办视图，取代原 `batches[0]` 猜测。

### D5 — 按作用域解析字段列
- `/api/fields` 支持可选 `scenarioId`（或 `batchId`，服务端据批次解析其 `scenarioId`）返回指定场景字段，**不改全局活动场景**；无参时维持现状（全局活动场景）。
- `useFieldSchema(opts?: { batchId?; scenarioId? })`。
- 隔离模式：列 = 批次场景。
- 审核台明细：按所选**文档所属批次**的场景出列（每个文档单场景，无错位）。

### D6 — 结果页「全部」混场景列退化
- `/api/rows` 响应补充 `scenarioIds: string[]`（当前过滤结果集涉及的去重场景）。
- 结果页：
  - `scenarioIds.length <= 1` → 用该场景（或全局）完整列。
  - `> 1` → 退化为**公共核心列**（`code/name/unit/qty/price/amount` 等核心列），隐藏各场景 extra 列，并在表头上方提示「多场景混合，扩展列已隐藏；选择具体批次查看完整列」。
- 理由：扁平混排表无法同时正确呈现多套 extra 列；核心列是所有场景共有的安全交集；今天单场景即完整列，零退化。

## Risks / Trade-offs

- 审核台「全部」新增跨批次文档列表是新数据通路（分页/过滤/性能）——以服务端分页 + 复用既有 `groupBy` 统计缓解。
- 作用域放 URL 而非全局状态：products/queue 等页不受影响（符合预期），但用户切到那些页再回来作用域以 URL 为准、不跨页"粘住"到非批次页——可接受。
- 混场景退化今天不可见（仅 grocery），属面向未来投资；需测试用桩场景覆盖，避免回归时悄悄退化。

## Migration Plan

- 纯增量：不改库表、不改导出引擎。
- 前端默认行为变化（审核台默认全部）对用户可见——属本次目标，无需兼容旧默认。

## Open Questions

- 结果页「全部」多场景时，是否提供「场景」二级筛选以查看某场景完整列（而非只退化到核心列）？暂记为后续增强，本次先做核心列退化 + 提示。
