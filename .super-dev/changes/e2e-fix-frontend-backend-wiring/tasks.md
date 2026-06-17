# Tasks: e2e-fix-frontend-backend-wiring

> 状态：已实施并回归通过（2026-06-17）。`build` / `lint`（0 error/warning）/ `test`（9/9）全绿；Playwright 巡检全站 0 控制台错误；关键契约用 curl 验证（空选择确认→400、导出→真实 xlsx、冲突 PATCH 不存在→404、原图→200 svg）。逐项完成情况见文末「实施记录」。

> 来源：端到端测试（2026-06-17）。在真实数据库（dev.db：1 批次 / 1 文档 / 4 行 / 2 provider）上启动生产构建（`next start`，端口 3100），用 Playwright + curl 走遍全部页面与 API。
>
> 结论：后端服务与业务逻辑基本健康（9 个单元/集成测试全过，build/tsc 通过，导出/重建/批量确认等端点返回 200），但**前端与后端大面积未接线**——多处仍在用 `@/data/mock-data` 的静默回退展示假数据，多个已存在的后端端点前端从不调用。现有 `rebuild-next-fullstack-ocr/tasks.md` 中标记为已完成的 `5.8 用 API 替换前端 mock 数据` 与 `6.4 Lint passes` 与实测不符。

## 测试结论汇总

| 信号 | 结果 |
| --- | --- |
| `npm test`（单元+集成） | 9/9 通过 |
| `tsc --noEmit` | 通过 |
| `npm run build` | 通过（21 路由） |
| `npm run lint` | **1 error**（settings-page.tsx:69） |
| Playwright 页面巡检 | 仪表盘/审核页显示 mock 数据；审核页控制台 2 个 404 错误 |
| API 探针（GET/POST curl） | 端点本身均 200，逻辑健康 |

---

## P0 — 核心功能不可用（最高优先级）

### 1. 仪表盘整页为 mock 数据，未接任何 API
- 文件：[src/components/dashboard/dashboard-page.tsx](../../../nice-ocr/src/components/dashboard/dashboard-page.tsx)
- 证据：`metricCards` 6 个指标卡硬编码（文档总数 1,248 / 处理排队 236 / 失败 34 / 待审核 1,532 / 冲突 127 / 已确认 8,765）；趋势图为写死的 `[18,24,35,52,83,77,58,64]` 假柱状；「待处理风险」用 `conflicts`（mock）；「最近失败」用 `documents`（mock）。真实 DB 只有 1 批次/1 文档/4 行。
- [ ] 新增统计聚合接口（如 `GET /api/dashboard/summary`），返回文档总数、排队数、失败数、待审核行、冲突数、已确认行（基于 Prisma `count`/`groupBy`）。
- [ ] 指标卡、趋势、待处理风险、最近失败全部改用 `useQuery` 拉真实数据。
- [ ] 移除对 `@/data/mock-data` 的依赖；空数据时展示明确空态而非假数字。
- [ ] 「刷新状态 / 新建批次 / 进入审核 / 批量重试 / 重试」按钮接入真实动作（刷新=refetch，进入审核=路由跳转，重试=调用 retry 接口）。
- 验收：仪表盘数字与 `GET /api/batches`、`/api/rows`、`/api/conflicts` 一致；DB 清空后显示 0 而非 1,248。

### 2. 审核工作台用 mock 文档 ID 查询 → 404 → 回退 mock，原图永不加载
- 文件：[src/components/review/review-page.tsx](../../../nice-ocr/src/components/review/review-page.tsx#L58-L63)
- 证据：`queryKey: ["document", documents[0].id]` 与 `apiGet(\`/api/documents/${documents[0].id}\`)`，其中 `documents[0].id === "doc-0123"` 是 mock id。浏览器控制台实测 2 个 `404 /api/documents/doc-0123`，随后回退 `recognitionRows`（mock）。原图区是写死的灰色骨架（L91-100），从不请求 `/api/documents/[id]/image`。缩略图列表（L103-108）、识别尝试对比（L157-169）、风险详情（L177-181）均硬编码。
- [ ] 文档/行数据来源改为真实：进入审核页前先选定真实文档（从批次/结果页带 `documentId`，或调用列表接口取首个待审文档）。
- [ ] 原图区改为 `<img src={\`/api/documents/${id}/image\`}>`，处理加载/缺图占位。
- [ ] 缩略图列表、识别尝试对比、风险详情改用接口数据（attempts 来自 document 详情）。
- [ ] 「上一张 / 下一张 / 确认本单所有行 / 补充行 / 逐行确认」接入真实动作（依赖任务 9 的按行/按单据确认接口）。
- 验收：审核页控制台 0 错误；显示真实行（如「合计」行）而非 mock 的苹果/香蕉/牛奶；切换文档原图随之更新。

### 3. 顶栏 AppShell 全静态
- 文件：[src/components/app-shell/app-shell.tsx](../../../nice-ocr/src/components/app-shell/app-shell.tsx#L80-L105)
- 证据：批次下拉硬编码 3 个 `<option>`（与真实批次无关）；搜索框是 `<div>` 不是 `<input>`（L87-90）；「Worker 在线」为写死文案（L93-96）；「上传图片」「任务队列」按钮无 `onClick`；左侧导航全部用 `<Link>` 但无 `usePathname` 当前页高亮。
- [ ] 批次下拉改为拉 `GET /api/batches` 并驱动全局当前批次状态。
- [ ] 搜索框改为受控 `<input>` 并接入搜索/过滤。
- [ ] 「Worker 在线」改为真实 worker/队列状态（或在未实现前移除以免误导）。
- [ ] 「上传图片」打开上传流程（任务 4）；「任务队列」打开队列面板或移除。
- [ ] 导航项基于 `usePathname()` 高亮当前页。

---

## P1 — 已存在后端端点但前端从不调用（孤立端点）

> 经 curl 验证下列端点均正常工作，问题纯在「未接线」。

### 4. 上传链路未接线
- 端点：`POST /api/batches/[id]/upload`（存在，未被任何组件调用）
- 涉及按钮：AppShell「上传图片」、批次页「上传文件」、导入页。
- [ ] 实现文件选择 + `FormData` 上传到 `/api/batches/[id]/upload`，上传后刷新批次/文档列表。
- 验收：可在 UI 上传一张图片并在批次详情看到新文档。

### 5. 导出未接线
- 端点：`POST /api/exports/recognition`、`POST /api/exports/products`（均存在，curl 200）
- 涉及按钮：结果页「导出」、产品库页「导出」。
- [ ] 「导出」按钮 POST 对应端点并触发文件下载（Excel/CSV blob）。
- 验收：点击导出能下载到包含真实行/产品的文件。

### 6. 重建产品库未接线
- 端点：`POST /api/products/rebuild`（存在，curl 200）
- 涉及按钮：结果页「重建产品库」、产品库页「重建观察」。
- [ ] 按钮调用 rebuild 接口，完成后 `invalidateQueries(["products"])` 刷新。
- 验收：重建后产品库与冲突数据按最新识别行刷新。

### 7. 文档重试未接线
- 端点：`POST /api/documents/[id]/retry`（存在）
- 涉及按钮：仪表盘「重试 / 批量重试」、审核页等。
- [ ] 「重试」调用 retry 接口并刷新对应列表/状态。

### 8. 导入页完全静态
- 文件：[src/components/import/import-page.tsx](../../../nice-ocr/src/components/import/import-page.tsx)；端点 `POST /api/import/v5`（存在，集成测试已覆盖）
- 证据：整页无 `useState`/`fetch`，4 个上传卡片无 `<input type=file>`，预览恒为 0，「选择 / 开始导入」无 `onClick`。
- [ ] 加 file inputs，读取 recognition-results / image-library / product-library JSON，POST 到 `/api/import/v5`。
- [ ] 导入预览展示真实计数（识别行/图片/产品/缺失图片）。
- 验收：可导入 v5 数据并在结果页看到新行。

### 9. 行确认 / 冲突解决未接线，且后端契约缺失
- 端点现状：`POST /api/rows/bulk-confirm` 存在，但**忽略前端传入的 `rowIds`**——见 [src/app/api/rows/bulk-confirm/route.ts](../../../nice-ocr/src/app/api/rows/bulk-confirm/route.ts#L9-L16)，只按 `batchId + onlyLowRisk(默认 true)` 过滤。curl 传 `{"rowIds":[]}` 仍返回 `{"updated":1}`（确认了低风险行）。这与 UI 语义「确认本单所有行」「逐行确认所选行」不匹配。冲突「解决」则**完全无后端端点**（`/api/conflicts` 仅 GET）。
- [ ] 扩展/新增确认接口：支持按 `rowIds[]` 确认、按 `documentId` 确认整单；保留 `onlyLowRisk` 选项但不再作为唯一过滤。
- [ ] 新增 `PATCH /api/conflicts/[id]`（或 `/resolve`）支持解决/忽略冲突。
- [ ] 结果页逐行「确认」、审核页「确认本单所有行」、冲突页「解决」接入上述接口。
- 验收：选中具体行确认只影响所选行；高风险行不会因空选被误确认；冲突可被标记为已解决并从列表消失。

### 10. 列表页筛选 / 搜索 / 分页全为静态装饰
- 文件：[results-page.tsx](../../../nice-ocr/src/components/results/results-page.tsx#L91-L101)、[products-page.tsx](../../../nice-ocr/src/components/products/products-page.tsx#L60-L66)、[batches-page.tsx](../../../nice-ocr/src/components/batches/batches-page.tsx#L61-L75)、[conflicts-page.tsx](../../../nice-ocr/src/components/products/conflicts-page.tsx#L50)
- 证据：所有筛选 `<select>`/搜索 `<input>` 无受控状态、无查询参数；结果页分页「共 1,532 条」硬编码、5 个页码按钮无 `onClick`；「更多操作」按钮无功能。
- [ ] 后端列表接口支持分页/筛选查询参数（batch、status、risk、关键字等）。
- [ ] 前端筛选/搜索/分页改为受控并驱动 `useQuery`；分页计数用真实 total。
- 验收：切换筛选/翻页能改变返回数据；计数与真实总数一致。

---

## P2 — 数据/契约问题

### 11. 审核原图恒 404（种子无图 + 无补图链路）
- 证据：用真实 `documentId` 请求 `/api/documents/<real>/image` 仍 404；端点逻辑正确（`!document.storedPath` → 404，见 image/route.ts），根因是种子数据 `storedPath` 为空且上传未接线（任务 4）。
- [ ] 种子数据补一张可用样图（或文档化「需先上传」）；上传链路打通后回归验证。

### 12. 产品库出现次数 / 来源文档恒为 0；冲突来源行恒为 0
- 证据：[products-page.tsx toProductItem](../../../nice-ocr/src/components/products/products-page.tsx#L23-L38) 把 `observationCount`/`sourceDocuments` 写死 0（API 不返回）；[conflicts-page.tsx](../../../nice-ocr/src/components/products/conflicts-page.tsx#L31) `sourceRowIdsJson` 恒 `"[]"` → `sourceCount` 恒 0。
- [ ] 产品接口补充 observation/来源文档计数；冲突写入真实 `sourceRowIds`。

### 13. 冲突状态徽章硬编码「未处理」
- 文件：[conflicts-page.tsx](../../../nice-ocr/src/components/products/conflicts-page.tsx#L74)
- 证据：`<Badge tone="warning">未处理</Badge>` 忽略 `conflict.status`（open/resolved/ignored）。
- [ ] 徽章按 `conflict.status` 渲染。

---

## P3 — 质量门禁 / 规范

### 14. Lint 存在 1 个 error（门禁未真正通过）
- 文件：[settings-page.tsx:69](../../../nice-ocr/src/components/settings/settings-page.tsx#L67-L74)
- 证据：`react-hooks/set-state-in-effect` —— `useEffect` 内直接 `setDraft(...)` 触发级联渲染。
- [ ] 改为在 `useQuery` 的 `select`/`onSuccess` 派生 draft，或用 key 重置受控组件，消除 effect 内 setState。
- 验收：`npm run lint` 无 error。

### 15. 移除 mock 静默回退，补齐 loading/empty/error 态
- 证据：7 个页面组件均 `?? mockData` 静默回退，会把真实 API 故障（如审核页 404）伪装成「有数据」，掩盖问题。
- [ ] 去除业务页对 `@/data/mock-data` 的回退；接口失败显式报错/空态，加载时显示骨架。
- [ ] `@/data/mock-data` 仅保留给测试/Storybook（如无用则删除）。

### 16. 回归校正既有 tasks 勾选
- [ ] 修正 [rebuild-next-fullstack-ocr/tasks.md](../rebuild-next-fullstack-ocr/tasks.md) 中 `5.8 用 API 替换前端 mock 数据`、`6.4 Lint passes`、`6.5 Runtime smoke passes` 的状态（当前与实测不符）。

---

## 建议修复顺序

1. **先修后端契约缺口**（任务 9 确认/冲突解决接口、任务 1 dashboard 聚合、任务 10 分页筛选参数、任务 12 计数字段）——前端接线依赖这些契约。
2. **再做前端接线**（P0 任务 1/2/3 → P1 任务 4-8/10 → P2 任务 13）。
3. **最后清理质量项**（任务 14 lint、任务 15 去 mock 回退、任务 11 样图、任务 16 校正勾选）。
4. 每完成一组：`npm run build && npm run lint && npm test`，并用 Playwright 回归对应页面（控制台 0 错误）。

---

## 实施记录（2026-06-17 已完成）

**新增后端**
- `GET /api/dashboard/summary`：指标聚合 + 待处理风险 + 最近失败（任务 1）。
- `PATCH /api/conflicts/[id]`：解决 / 忽略冲突（任务 9）。
- `POST /api/rows/bulk-confirm` 重写：支持 `rowIds[]` / `documentId` / `batchId`，空选择返回 400（任务 9）。
- `GET /api/products` 增强：真实 `observationCount` / `sourceDocuments` + `onlyConflicts` 过滤（任务 12）。
- 新增 `src/lib/api/paths.ts` 共享路径常量；`client.ts` 增加 `apiUpload` / `apiDownload`。

**前端接线**
- [x] 任务 1 仪表盘：改用 `dashboard/summary`，指标卡 / 审核进度 / 待处理风险 / 最近失败全真实；刷新=refetch，重试=retry API，新建/进入审核=路由。
- [x] 任务 2 审核台：真实文档（取活跃批次首个文档，缩略图可切换）+ 真实 `/api/documents/[id]/image` 原图 + 真实识别明细/尝试 + 逐行确认 / 确认本单所有行；控制台 0 错误（原 2 个 404 消除）。
- [x] 任务 3 顶栏：真实批次下拉、`usePathname` 当前页高亮、可用搜索框（回车跳结果）、真实队列状态、上传入口指向活跃批次。
- [x] 任务 4 上传：批次页 / 批次详情接 `batchUpload`。
- [x] 任务 5 导出：结果页 / 产品库页 `apiDownload` 触发 xlsx 下载（验证 7KB 文件）。
- [x] 任务 6 重建：结果页 / 产品库页接 `productsRebuild`。
- [x] 任务 7 重试：仪表盘 / 批次详情接 `documentRetry`。
- [x] 任务 8 导入页：file input + `import/v5`，结果计数实时回填。
- [x] 任务 9 确认 / 冲突解决：审核台 + 结果页逐行确认；冲突页解决 / 忽略（Playwright 验证生效）。
- [x] 任务 10 筛选 / 分页：结果页受控筛选 + 真实分页；产品库 / 批次受控搜索过滤。
- [x] 任务 13 冲突状态徽章：按 `conflict.status` 渲染。

**质量**
- [x] 任务 11 原图：seed 生成 SVG 单据占位图，`image` 端点返回 200。
- [x] 任务 14 lint：settings 改为渲染期同步，消除 set-state-in-effect；`lint` 0 error/warning。
- [x] 任务 15 去 mock 回退：移除所有页面对 mock-data 的回退，删除 `src/data/mock-data.ts`，改为加载 / 空态。

**未做（明确记录）**
- [ ] 任务 16 仅校正历史 tasks 勾选：原 `5.8 用 API 替换 mock` / `6.4 Lint passes` 在本次修复后已真实成立，未改写历史文件。
- [ ] bulk-confirm / 冲突解决的 HTTP 路由级回归测试：现有测试体系针对 workflow 函数（带事务回滚），路由内联逻辑暂以 Playwright + curl 端到端验证覆盖；如需单测建议先把 confirm 逻辑抽成 workflow 函数。
- [ ] 「补充行」「任务队列」无对应后端，已移除死按钮而非接线（如需新增请先补后端）。
