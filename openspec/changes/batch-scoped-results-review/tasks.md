# Tasks

## 1. 字段解析按作用域（后端 + hook）
- [x] 1.1 `/api/fields` GET 支持可选 `scenarioId`（及 `batchId`→解析批次 scenarioId）返回指定场景字段，不改全局活动场景；无参维持现状
- [x] 1.2 `useFieldSchema(opts?: { batchId?; scenarioId? })` 透传查询参数，缓存键含作用域
- [x] 1.3 测试：按 scenarioId 取字段不影响全局活动场景

## 2. 结果集场景集合（后端）
- [x] 2.1 `/api/rows` 响应补充 `scenarioIds: string[]`（当前过滤结果集涉及的去重场景）
- [x] 2.2 测试：跨多批次（异场景桩）结果集返回正确的 scenarioIds

## 3. 跨批次文档列表（后端）
- [x] 3.1 新增跨批次文档列表能力：返回 `{ id, originalName, batchId, batchName, riskLevel, reviewState, rowStats }`，支持 `reviewState`/搜索过滤、`batchId` 收窄、分页
- [x] 3.2 测试：全部模式列出多批次文档；按 reviewState 过滤；按 batchId 收窄

## 4. 共享作用域选择器（前端）
- [x] 4.1 新增 `BatchScopeSelect`（全部 + 批次列表），onChange 改写 URL `?batchId`（全部=移除参数）
- [x] 4.2 轻量批次选项数据源（名称+id，倒序）

## 5. 全部结果页改造（前端）
- [x] 5.1 接入 `BatchScopeSelect`，替换原「清除批次」chip 交互（保留已选批次视觉标识）
- [x] 5.2 隔离模式：列用批次场景（D5）、导出默认带批次模板、显示 `BatchWorkspaceNav`
- [x] 5.3 全部模式：按 `scenarioIds` 自适应列——单场景完整列，多场景退化核心列 + 提示横幅
- [x] 5.4 运行时验证：默认全部 / 选批次隔离 / 切回全部 / 异场景退化（桩）

## 6. 审核工作台改造（前端）
- [x] 6.1 接入 `BatchScopeSelect`；默认（无 batchId）= 全部跨批次待办，取代 `batches[0]`
- [x] 6.2 全部模式左列改用跨批次文档列表，标注所属批次；保留搜索/状态过滤/分页
- [x] 6.3 明细列按所选文档所属批次场景解析（D5）
- [x] 6.4 「运行审核」在全部模式作用于当前所选文档所属批次；「确认本单」两模式通用
- [x] 6.5 上一张/下一张 + 专注模式 ←/→ 在当前过滤列表内迭代
- [x] 6.6 运行时验证：全部待办流转 / 选批次隔离 / 跨批次切换文档不丢上下文

## 7. 贯通与回归
- [x] 7.1 结果 ↔ 审核 互链透传 `batchId`，切标签不丢作用域
- [x] 7.2 `BatchWorkspaceNav` 三标签深链与作用域选择器状态一致
- [x] 7.3 build + lint 通过；关键路径测试绿
