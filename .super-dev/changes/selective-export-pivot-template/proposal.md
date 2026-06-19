# Change Proposal: selective-export-pivot-template

> 承接已落地的 [[field-schema-templates]]；研究/设计见 output/nice-ocr-export-template-research.md + output/nice-ocr-export-template-design.md
> 决策已确认（2026-06-19）：见设计文档「决策锁定」。

## Summary

在已有「字段 schema 单一事实源 + 导出模板注册表 + 共享样式引擎」地基上，新增四项能力：

1. **选择性导出**：从当前的「全库导出」改为按 `scope`（批次 + 当前筛选）下推 where。
2. **导出模式**：新建 / 追加 / 合并；追加&合并以**上传已有 xlsx 并入**实现（无状态）。
3. **批次绑定 Excel 模板**：创建批次时选导出模板，同时绑定抽取场景（scenario），抽取与导出都走该模板对应内容。
4. **多 sheet 透视模板**：把参考文件 `副食品采购统计表` 的「目录 + 单产品 × 月份透视 + 评估列计算」布局，抽象为可复用的 `purchase-stats-20260619` 模板。

并据此把 `ExportTemplate` 从「单表列定义」泛化为「工作簿渲染策略（flat | pivot）」，新增模板只加策略不改调用方——满足"做好兼容、兼容后续处理"。

## Background / Problems

- 导出写死 `where:{ deletedAt:null }`（[exports.ts:27](../../../nice-ocr/src/lib/workflows/exports.ts#L27)）→ **全库导出**，无法按批次/筛选/选中导出。
- 只有「新建一份」一种导出形态，无法把新数据并入已有成品文件。
- 现 `ExportTemplate` 仅支持单 sheet 平铺（`resolveColumns`），无法表达参考文件那种 1 目录 + 1209 单产品 sheet 的透视布局。
- Batch 无 `exportTemplateId`/`scenarioId`，模板/场景是全局的，不能按批次定制。
- 识别 schema/提示词写死副食品 7 字段（[schema.ts](../../../nice-ocr/src/lib/recognition/schema.ts) / [settings.ts:13](../../../nice-ocr/src/lib/recognition/settings.ts#L13)），无法按场景驱动（上次 task D 延后项）。

## Goals

- `ExportTemplate` 泛化为 `kind: flat | pivot` + 统一 `renderWorkbook`；`v5-20260618` 行为零变化。
- 新增 `purchase-stats-20260619`（pivot）：目录索引 + 单产品 sheet（动态月份列降序 + 数量落格）+ 评估单价/评估金额**系统计算**（首条数据行）。
- 选择性导出：`ExportScope { batchId/status/risk/auditState/month/code/name }` 下推 where。
- 导出模式：`mode: new|append|merge`，append/merge 经 `multipart` 上传基准 xlsx 并入，结构校验 + 友好报错。
- Batch 加 `exportTemplateId`/`scenarioId`（一次迁移，可空，零破坏）；创建 UI 选模板并带出 scenario。
- scenario 驱动抽取接通：动态 zod schema + 动态提示词 + provider 注入；grocery 等价、行为保持。
- `ExportRecord` 开始写入（templateId/scope/mode/rowCount）。

## Design（详见 output/nice-ocr-export-template-design.md）

- **模板渲染策略**：`FlatExportTemplate`（复用 `writeTemplateSheet`）/ `PivotExportTemplate`（透视构建）；`renderWorkbook(workbook, template, rows, scenarioId)` 按 kind 分派。
- **pivot 算法**：按 `code+name` 分组 → sheet 名安全化（≤31 字符、去 `:\/?*[]`、重名去重）→ 目录（序号/产品名，横向 7 栏）→ 单产品 sheet（合并标题、月份列=该产品出现月份降序、qty 落格、评估列首行计算）。月份字符串 `"YYYY年M月"` 与数据 `normalizedMonth` 同构，零转换。
- **pivot 不走流式**（需全量分组）；flat 保留流式。
- **scenario 驱动抽取**：`buildExtractionRowSchema(fields)` / `buildRecognitionPrompt(scenario, fields)` / `createConfiguredRecognitionProvider(scenarioId?)` 注入 schema+prompt；`normalizeExtraction` 拆核心列/extraJson。
- **批次绑定**：模板声明 `scenarioId`，创建批次选模板即带出场景；导出/抽取按批次字段回退全局。

## Scope Boundary（本期范围）

- 选择性导出首期 = 批次 + 当前筛选；**行级多选 checkbox 下一期**。
- 追加/合并 = 上传基准文件并入；**不做服务端累积文件**。
- 评估列 = 系统计算（均价 / 单价×Σqty），写首条数据行。
- 新模板字段仍由代码注册表声明；**在线字段/模板可视化编辑器不在本期**。

## Non-Goals

- 在线字段构建器 / 模板可视化编辑器；行级多选导出；服务端累积导出文件；多租户字段隔离。

## Verification

- 单测：pivot 透视（分组/月份降序/数量落格/评估列计算/sheet 名安全化去重）、scope where 下推、append 并入（产品并集+月份并集+行追加）、动态 schema/prompt 生成、`v5-20260618` flat 回归。
- 运行时：build 零错误；创建批次选 `purchase-stats-20260619` → 导出 → exceljs 校验 sheet 数/表头/格值/评估列；上传样本 xlsx 走 append 校验行增长；grocery 抽取产物与现状等价。
- 回归：现有 22 个单测保持全绿（见 [[nice-ocr-test-setup]]）。
