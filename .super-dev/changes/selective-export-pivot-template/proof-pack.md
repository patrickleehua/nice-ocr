# Proof Pack: selective-export-pivot-template

> 完成日期: 2026-06-19 ｜ 模式: evolve（承接 field-schema-templates）

## 交付范围（4 个里程碑，全部完成）

| 里程碑 | 内容 | 提交 |
|---|---|---|
| M1 | 模板渲染策略泛化（flat\|pivot + renderWorkbook）+ 采购统计表 pivot 模板 | 91f964f |
| M2 | 选择性导出（ExportScope 下推 where，批次+当前筛选） | da7ef45 |
| M3a | 批次绑定导出模板（创建即选 + 派生场景 + 详情页直出） | 0d22097 |
| M3b | scenario 驱动抽取接通（动态 schema/提示词注入，grocery 零变更） | 1786aab |
| M4 | 导出模式（追加/合并：上传基准 xlsx 并入） | （本提交） |

## 质量门结果

- `tsc --noEmit`：0 错误
- `eslint`：0 警告（全部改动文件）
- `npm test`（隔离 test.db）：**61/61 通过**（起始 22 → 新增 39 项覆盖 M1–M4）
- `next build`：成功（29/29 页面，所有 API 路由编译通过）

## 关键验证证据

- **pivot 透视渲染**：写盘→exceljs 读回，校验 sheet 数（目录+每产品）、合并标题、月份降序、数量落格、评估单价=price>0 均值/评估金额=单价×Σqty；边界：空编码独立成页、超长名 sheet 名截断 31 字符、price=0 排除出均值。
- **选择性导出**：scopeToWhere 单测（镜像 rows 筛选语义/空值忽略/rowIds）+ DB 集成（按 name 过滤=1 行、不存在 batchId=空表）。
- **批次绑定**：Prisma `db push` 加 `exportTemplateId`/`scenarioId`（非破坏）；DB 往返测试绑定+派生场景。
- **scenario 驱动抽取**：grocery 动态 schema 与默认 schema 解析等价（零行为变更）+ 非默认场景 prompt 生成 + extra 字段拆分 + 默认场景复用同一配置。
- **追加并入**：extractPivotRows 反向解析往返 + 结构非法抛错 + DB 端到端（基准 1 行 + 新 2 行 → 月份并集、3 数据行、newRowCount=2）。

## 已知取舍 / 边界

- pivot 表不存每行单价，追加时反向解析无法还原旧记录单价 → 重渲染后**评估单价按新数据均值重算**（数量/月份/产品完整保留）。用户已确认按此推进。
- 追加/合并均实现为「并入上传基准」（无服务端累积文件）；append 与 merge 当前同义。
- 行级多选 checkbox 导出为**下一期**（后端 scope.rowIds 已就绪）。
- scenario 驱动抽取：grocery 为唯一在用场景且零行为变更；新增第二场景时其核心列若不同需在 worker 落库侧补充（机制已就位）。

## 触达入口（用户视角）

- 创建批次 → 选「采购统计表（多 sheet 透视）」模板（自动带出 grocery 场景）。
- 批次详情页 → 一键导出绑定模板 / 「追加」上传已有表并入。
- 全部结果页 → 按当前筛选选择性导出 + 模板下拉（每模板可导出/追加）。
