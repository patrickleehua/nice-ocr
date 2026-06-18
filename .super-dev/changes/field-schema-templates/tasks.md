# Tasks: field-schema-templates

> 顺序：前端优先 + 运行时验证 → 后端/识别 → 测试/交付。每完成一组跑 `npm run build`。

## 进展（2026-06-18）
- ✅ A 字段基座、E DB 迁移（extraJson）、B 前端修抖动+动态列、C 导出模板体系、F 质量门 已完成并验证。
- ✅ 抖动修复运行时实测：编辑后行序不变、不跳顶；standard 导出与 v5 列**完全一致**（`EXACT_MATCH_V5=true`）。
- 🔧 范围调整（按用户确认）：导出仅保留**单一 `v5-20260618` 模板**（删除 concise/by-month）；模板系统就绪，新模板后续再加。
- ⏸ D 识别链路动态化：**延后为就绪扩展点**（实时 worker 未接通、仅 grocery 单场景，其字段=v5 模板识别列，对应关系已成立）。新增第二场景/模板时再接通 `buildExtractionRowSchema`/`buildRecognitionPrompt`。
- 质量门结果：tsc 0 错误 · build 成功 · lint 0 警告 · 单测 22/22 通过。

## 0. 编码前门禁
- [ ] 复核依赖版本（exceljs 4.4 / Next 16 / React 19 已确认），如需查 ExcelJS 分 Sheet/样式 API 先看官方文档
- [ ] 锁定：图标 lucide-react、复用既有 Button/select/token，无 emoji

## A. field-schema 基座（前后端共享）
- [ ] A1 新增 `src/lib/fields/field-schema.ts`：`FieldDef`/`FieldScenario` 类型、内置字段目录、元字段、内置场景 `grocery`、`getScenario`/`getActiveFields`
- [ ] A2 活动场景读写：`AppSetting` key `fields.activeScenario`，`getActiveScenarioId`/`setActiveScenarioId`（缺省 grocery）
- [ ] A3 单测：场景解析 / 核心-extra 字段拆分

## B. 前端：修抖动 + 动态列（先做，可视化验证）
- [ ] B1 结果表/审核台可编辑单元格改**常驻输入框**：本地状态 + onBlur/Enter 提交 + 250–400ms 防抖；`type-fixed` 表布局 + 列宽，消除布局位移
- [ ] B2 提交改**乐观更新**（`setQueryData` 就地改该行），不再 `invalidateQueries(["rows"])` 全表重拉；后台静默校正
- [ ] B3 rows API 排序改稳定键（`rowIndex`/`createdAt asc`），编辑不跳行
- [ ] B4 `useFieldSchema` hook：拉活动场景字段；[results-page.tsx](../../../nice-ocr/src/components/results/results-page.tsx) / [review-page.tsx](../../../nice-ocr/src/components/review/review-page.tsx) 按字段动态渲染表头 + 核心列 + extraJson 列
- [ ] B5 运行时验证：启动应用，Playwright 打开「全部结果」点击编辑，截图确认无抖动、无跳行 → **preview 确认门**

## C. 导出模板体系
- [ ] C1 新增 `src/lib/workflows/export-templates.ts`：`ExportTemplate` 注册表 + 内置 `standard`/`concise`/`by-month`
- [ ] C2 共享样式引擎：深色表头 + numFmt + CJK 自适应列宽 + 冻结首行（对齐 v5）
- [ ] C3 重构 [exports.ts](../../../nice-ocr/src/lib/workflows/exports.ts) `buildRecognitionExport(templateId)`：按模板 fieldKeys 取值（核心列/extraJson/元字段）+ 可选 groupBy 分 Sheet
- [ ] C4 API：`POST /api/exports/recognition` 接 `{ templateId }`；新增 `GET /api/exports/templates`；`apiPaths` 加常量
- [ ] C5 前端：导出按钮 → 模板下拉选择（lucide，无 emoji）
- [ ] C6 单测：三模板取值 + 样式 + 分 Sheet；运行时导出 xlsx 打开校验

## D. 识别链路通用化
- [ ] D1 `schema.ts`：`buildExtractionRowSchema(fields)` 动态 zod；保留 `extractionResultSchema` 兼容默认场景
- [ ] D2 `settings.ts`：`buildRecognitionPrompt(scenario, fields)` 取代硬编码副食品文案（缺省场景文案等价）
- [ ] D3 [provider.ts](../../../nice-ocr/src/lib/recognition/provider.ts)：结构化输出用动态 schema；`normalizeExtraction` 拆 {核心列}+{extraJson}
- [ ] D4 落库 extraJson：[import-v5.ts](../../../nice-ocr/src/lib/workflows/import-v5.ts) + [rows update API](../../../nice-ocr/src/app/api/rows/route.ts) 支持 extra 字段
- [ ] D5 单测：动态 schema/prompt 生成；extra 字段往返（入库→读取→导出）

## E. 数据模型
- [ ] E1 Prisma：`RecognitionRow` 加 `extraJson String @default("{}")`，`prisma generate` + 迁移（见 [[prisma-generate-required]]）
- [ ] E2 设置页：活动场景选择器（可选，最小实现）

## F. 质量门 / 交付
- [ ] F1 `npm run build` + lint 零错误
- [ ] F2 `npm test`（隔离 test.db，见 [[nice-ocr-test-setup]]）全绿，含新增单测
- [ ] F3 运行时冒烟：编辑无抖动 + 三模板导出正确（截图留证）
- [ ] F4 更新架构文档 + 本 change 的 proof-pack
