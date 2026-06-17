# Tasks: audit-ai-module（确认后数据的二次 AI 复查 / 复审兜底）

> 来源：用户研究诉求 + 4 项决策确认（2026-06-17）。研究文档：`output/nice-ocr-audit-module-research.md`。
> 决策：范围=**以 ai_auto 为主**；方式=**方案C 混合(规则统计预筛 → 可疑+抽样 AI 复核)**；
> 触发=**手动"运行审核"按钮**；处置=**存疑退回人工复审队列,审核 AI 只建议不改写**。
> 原则：避免过度、约定大于配置、无级联、每功能点 commit。

## 目标
给"机器自动通过(ai_auto)却无人复核"的盲区兜底：用规则/统计预筛 + 独立第三次 AI 交叉验证，
把存疑行挑进"复审队列"交人工，提升出厂精度而几乎不增加日常人工。

## 审核流水线（手动触发 → 每文档一个 audit job）
1. **Stage 1 规则/统计预筛（零 API）**：对目标文档的 `ai_auto` 行：
   - 重跑 `validateRow`（编码/非商品名/金额=数量×单价）。
   - 对照产品库历史（`ProductObservation`/确认行）：单价离群(中位数比值/MAD)、单位不一致、编码↔主导名称冲突。
   - 文档内重复行。
2. **Stage 2 第三次 AI 交叉验证（独立模型/提示词）**：对文档跑一次审核 provider 识别，
   用 `buildConsensusFlags` 比对 `ai_auto` 行是否被第三次独立读出复现；未复现=存疑。
   （复用现有 recognize + 一致性比对，不引入新 judge 协议。）
3. **判定与处置**：规则可疑 **或** 第三次未复现 → `auditState=flagged`，写 `auditNote` + `auditSuggestionJson`(AI 建议值，不改库)；
   其余 → `auditState=passed`。flagged 行进**复审队列**交人工，人工在审核台改值/确认 → `auditState=reviewed`。

## 功能点（每点一次 commit）
- [ ] **A Schema**：`RecognitionRow` 增 `auditState String @default("none")`(none/passed/flagged/reviewed)、`auditNote String?`、`auditedAt DateTime?`、`auditSuggestionJson String?`；`RecognitionDefaults` 增 `auditSampleRate`(0..1,默认0.1)、`auditProviderKey String?`；`prisma db push`。
- [ ] **B 审核逻辑(纯函数,可测)** `src/lib/recognition/audit.ts`：`buildPriceStats(observations)`、`auditRowByRules(row, stats, opts)`→{suspicious, reasons}、文档内重复检测；单测覆盖（离群/单位/编码-名称/重复/金额）。
- [ ] **C 队列 + worker**：`enqueueAuditJob(documentId, batchId)`；worker 处理 `type="audit"`：Stage1 规则 + Stage2 第三次识别(审核 provider，缺省选与主不同的 provider，否则主模型+审核提示词)；落 `auditState/auditNote/auditSuggestion`；记 `ExtractionAttempt(strategy="audit")` 与 `AuditLog`；`log` 抽样规模。
- [ ] **D API**：`POST /api/batches/:id/audit`（为该批次中含 ai_auto 行的文档入队 audit job，返回入队数）；`POST /api/documents/:id/audit`（单文档）；`dashboard/summary` 增 `flaggedRows`。
- [ ] **E UI**：批次页/审核台"运行审核"按钮；审核台新增"复审(flagged)"过滤 chip + 展示 `auditNote` 与 AI 建议值(一键采纳填入内联编辑)；仪表盘"待复审"指标；`AuditStateBadge`。
- [ ] **F 设置**：审核抽样率 + 审核 provider 选择(来自启用 provider)；GET/PUT round-trip。
- [ ] **G 测试 + 文档**：audit 纯函数单测并入 test；研究/tasks 文档；uiux 追加审核交互。

## 验证
- `prisma generate`→`db push`→`build`→`lint`(0)→`test`(≥既有全绿 + 新增 audit 单测)。
- 运行时：起 server，对已确认批次点"运行审核"，规则路径(Stage1)端到端产生 flagged；审核台"复审"过滤可见；仪表盘"待复审"计数；0 控制台错误。Stage2 AI 仅在确有第二 provider 或用户许可时实跑（成本透明）。
- 切勿 `db:seed`（清空 provider）。

## 非目标（避免过度）
- 不做全量 AI 复审（仅 ai_auto + 可疑/抽样）；不自动改写库（只建议）；不做定时/自动入队(第一版手动)；不做独立 ML 模型；不引入级联。
