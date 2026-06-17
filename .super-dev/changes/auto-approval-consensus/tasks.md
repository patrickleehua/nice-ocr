# Tasks: auto-approval-consensus（双次一致自动审批 + 标识类别 + 图片缩放）

> 状态：已实施并真实端到端验证（2026-06-17）。`build` / `lint`（0）/ `test`（14/14）全绿；
> 用真实单据图 + 实配 AI Provider(gpt-5.5) 验证：hybrid 模式下某文档 33 行经双次识别比对，
> **32 行 AI自动通过、1 行（双次不一致）转人工**，控制台 0 错误。

## 背景与目标
- 痛点：原流程需逐张逐行人工审核，参与度高。
- 目标：尽量减少人工参与，同时保持非常高精度。
- 用户决策：自动审批依据 = **双次识别一致 + 规则校验**；模式粒度 = **每批次可选 + 设置页全局默认**。

## 审批模式（Batch.approvalMode，新建批次继承全局默认）
- **manual 全人工**：单次识别，不自动通过，全部 `待人工复核`。
- **hybrid 混合（默认）**：双次识别；行「两次一致 且 低风险」→ `AI自动通过`；否则 `待人工复核`；高风险 → `冲突`。
- **auto AI自动**：双次识别；行「两次一致」即自动通过（低/中风险均可，靠一致性背书）；高风险或不一致 → 转人工。
- 不变量：**高风险任何模式都不自动通过**；自动通过永远以「双次一致」为前提（auto/hybrid）。

## 标识类别（RecognitionRow.reviewClass，UI 徽章）
`ai_auto` AI自动通过 · `human` 人工确认 · `pending_review` 待人工复核 · `conflict` 冲突。
人工点「确认」→ 置 `human`；worker 自动通过 → `ai_auto`。

## 实施清单
- [x] Schema：`Batch.approvalMode`、`RecognitionRow.reviewClass`（无级联，符合 AGENTS 约定）；`prisma db push`（增量加列、不丢数据）。
- [x] 决策模块 `src/lib/recognition/review.ts`（纯函数，可测）：`decideRowReview` + `buildConsensusFlags`（按编码/去空白名称匹配，数量/单价/金额容差内一致）。
- [x] Worker 重写：按模式跑 1 次或 2 次识别，记录每次 attempt，双次比对后按 `decideRowReview` 落库 status+reviewClass。
- [x] 人工确认 `confirmRecognitionRows` → `reviewClass=human`。
- [x] 设置：`RecognitionDefaults.approvalMode` 全局默认；批次创建继承（`POST /api/batches`）。
- [x] Dashboard summary：新增 `autoApprovedRows / humanConfirmedRows / autoApprovalRate`，仪表盘展示自动通过率。
- [x] UI：审核台「标识类别」列 + 模式徽章 + **图片放大/缩小/适应窗口/Ctrl+滚轮缩放**；结果页「标识类别」列；批次列表「审批模式」列；创建批次抽屉 + 设置页模式选择。
- [x] 测试：`review decisions`（高风险不自动通过、三模式门禁、双次一致匹配）；既有 14/14 通过。

## 验证记录
- 真实图 `201808_副本_IMG_100`/`IMG_10`，hybrid：doc(33 低风险行)→ 32 `ai_auto` + 1 `pending_review`（"豆皮" 行金额校验通过但两次识别不一致 → 正确拦截转人工）。
- 自动通过率体现在仪表盘「审核进度」。

## 后续可选
- [ ] Provider 设 `temperature=0` 提升双次确定性 → 进一步提高自动通过率。
- [ ] 行级「双次差异对比」抽屉，人工复核时并排显示两次识别值。
- [ ] consensus 可扩展为 N 次（consensus 策略）投票。
