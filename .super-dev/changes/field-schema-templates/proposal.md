# Change Proposal: field-schema-templates

## Summary

修复结果表/审核台「点击编辑抖动」，并把 Excel 导出重构为**可扩展模板体系**。更进一步：把识别字段从写死的「副食品销售单」场景中解耦，建立 **field-schema（字段схема）单一事实源**，由它统一驱动「AI 识别提取 → 入库 → 表格展示/编辑 → Excel 导出」，让系统支持多场景、多字段、多导出模板，新增字段/模板以配置为主而非改散落代码。

参考实现：用户认可的原始 v5 工具 `docs/v5_new_3 2`（编辑无抖动 + Excel 样式质量高）。

## Background / Problems

1. **编辑抖动**：[editable-cell.tsx](../../../nice-ocr/src/components/ui/editable-cell.tsx) 切换「展示 `<td>`」与「编辑 `<td><input>`」两套 DOM（布局位移），且提交后 `invalidateQueries(["rows"])` 全表重拉、服务端 `orderBy: updatedAt desc` 使被编辑行跳到顶部（行跳变）。v5 用常驻 `<input>` + 本地状态 + 防抖保存，永不重排，故不抖。
2. **导出僵化**：[exports.ts](../../../nice-ocr/src/lib/workflows/exports.ts) 平铺数据，无样式/数字格式/冻结/自适应列宽/模板。v5 `/api/export` 有深色表头、`#,##0.00`、CJK 自适应列宽、冻结首行。
3. **字段写死**：[schema.ts](../../../nice-ocr/src/lib/recognition/schema.ts)、[settings.ts](../../../nice-ocr/src/lib/recognition/settings.ts)（"识别副食品销售单"）、RecognitionRow 列、表格列、导出列全部硬编码 code/name/unit/qty/price/amount，系统被锁死在单一场景。

## Goals

- 消除两处编辑抖动成因（布局位移 + 行跳变），编辑交互对齐 v5（常驻输入框 + 本地状态 + 防抖/乐观提交）。
- 建立 `field-schema` 单一事实源：字段目录（FieldDef）+ 场景（FieldScenario，有序字段集）。
- 数据模型新增 `RecognitionRow.extraJson`（一次迁移），承载场景声明的非核心字段。
- 识别提示词 + 结构化输出 schema 由当前场景的字段集动态生成（替换硬编码）。
- 结果表/审核台**动态出列**（核心列 + extraJson 列），可编辑列用常驻输入框。
- Excel 导出重构为**模板注册表 + 共享样式引擎**（对齐 v5 质量基线），导出按钮加模板选择。
- 内置模板：仅 `v5-20260618`（**v5 原版精确复刻**，默认）。模板系统就绪，后续需要新模板再加（不预置投机模板）。

## Design

### 1. field-schema 单一事实源（`src/lib/fields/field-schema.ts`，新增）
- `FieldDef = { key, label, type: "text"|"number"|"month"|"date", core: boolean, editable: boolean, recognitionHint?, numFmt?, width?, align? }`
  - `core: true` → 映射到 RecognitionRow 真实列（code/name/unit/qty/price/amount/rawDate/normalizedMonth/remark）；`core: false` → 存入 `extraJson[key]`。
- `FieldScenario = { id, name, description, fieldKeys: string[] }`，声明该场景识别/管理哪些字段（有序）。
- 内置字段目录 + 内置场景 `grocery`（副食品销售单 = 现有核心字段），机制上支持新增场景/字段。
- 活动场景 id 存 `AppSetting`（`fields.activeScenario`，缺省 `grocery`）；设置页提供选择。
- 只读元字段（批次/文档/月份/状态/风险）单独定义，供表格与导出引用，不参与识别。

### 2. 数据模型（Prisma 迁移）
- `RecognitionRow` 增加 `extraJson String @default("{}")`，存 `{ [fieldKey]: value }`。其余列不动，审核/产品库/校验等既有逻辑只依赖核心列，**零行为变更**。

### 3. 识别链路通用化（`schema.ts` / `provider.ts` / `settings.ts`）
- `buildExtractionRowSchema(fields)` 按场景字段动态生成 zod 行 schema；`buildRecognitionPrompt(scenario, fields)` 按字段 + hint 生成提示词（替换硬编码副食品文案）。
- [provider.ts](../../../nice-ocr/src/lib/recognition/provider.ts) 结构化输出改用动态 schema；`normalizeExtraction` 把识别结果拆为 {核心列} + {extraJson}。
- 落库点（[import-v5.ts](../../../nice-ocr/src/lib/workflows/import-v5.ts) 及未来实时 worker）写入 extraJson；行更新 API [rows/[id]/route.ts](../../../nice-ocr/src/app/api/rows/route.ts) 支持 extra 字段 PATCH。

### 4. 导出模板体系（`src/lib/workflows/export-templates.ts`，新增 + 重构 exports.ts）
- `ExportTemplate = { id, name, description, sheetName, filename, resolveColumns() }`（注册表就绪，可随时追加模板）。
- **当前仅内置 `v5-20260618`（默认）= 原始 v5 导出"一模一样"复刻**：14 列（图片名/图片标签/原始日期/归一化月份/商品编码/商品名/单位/数量/单价/金额/状态/备注/资料库冲突/冲突原因），列名/顺序/列宽/数字格式与 v5 `/api/export` 完全一致。承载「走目前流程」。
- 不预置其它模板；后续需要新模板时在注册表加一项（`resolveColumns` 可基于 field-schema 场景字段动态出列），实现「后续扩展」。
- 共享样式引擎：深色表头(`FF2D3748`)+白色加粗居中、按 FieldDef.numFmt 设数字格式、CJK 感知自适应列宽、冻结首行（对齐 v5）。
- 取值：元字段/派生（图片名/标签/状态/资料库冲突=conflictState/冲突原因=riskReasonsJson）→ 核心列 → `extraJson[key]`。
- API `POST /api/exports/recognition` 接收 `{ templateId }`（缺省 `v5-20260618`）；`GET /api/exports/templates` 供前端列模板（单模板时前端直接导出，≥2 个才出选择下拉）。

### 5. 前端
- 抽 `useFieldSchema`（拉活动场景字段）；结果表/审核台按字段动态渲染表头与单元格。
- 可编辑单元格改为**常驻输入框**（本地状态 + onBlur/防抖提交，乐观更新缓存，不 invalidate 整表、不依赖 updatedAt 重排）；行排序改稳定键。
- 导出按钮 → 模板选择（下拉，lucide 图标，无 emoji）。

## Scope Boundary（本次范围）
- 场景/字段来自**可扩展注册表（代码配置）** + 设置页选活动场景；**字段构建 UI（在线增删字段）属后续迭代**，本次不做。
- 实时识别 worker 若尚未接通落库，本次保证「动态 schema/提示词生成 + import 落 extraJson + 展示/编辑/导出」可用并被测试覆盖；worker 接通后复用同一 field-schema。

## Non-Goals
- 在线字段构建器 UI、按用户的多租户字段隔离、导出模板可视化编辑器。

## Verification
- 单测：`buildExtractionRowSchema`/`buildRecognitionPrompt` 动态生成；导出模板取值与样式（核心列 + extraJson + 分 Sheet）。
- 运行时：`npm run build` 零错误；启动后结果表点击编辑无抖动/无跳行（Playwright 截图对比）；三种模板导出 xlsx 可打开、样式正确。
- 回归：现有审核/产品库/校验单测保持通过。
