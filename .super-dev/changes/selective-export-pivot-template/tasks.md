# Tasks: selective-export-pivot-template

> 顺序：M1 模板泛化+pivot → M2 选择性导出 → M3 批次绑定+scenario 抽取 → M4 导出模式。
> 每个功能点完成跑 `npm run build` + `npm test`，按文件隔离 commit（[[commit-per-feature-point]] / [[nice-ocr-concurrent-dev]]）。

## 0. 编码前门禁
- [ ] 复核依赖（exceljs 4.4 / Next 16 / React 19 / Prisma 7，已确认）；查 ExcelJS 多 sheet/合并单元格/读已有文件 API 先看官方文档
- [ ] 锁定：图标 lucide-react、复用既有 Button/select/token/`writeTemplateSheet`，无 emoji、颜色走 token

## M1. 模板渲染策略泛化 + pivot 模板（先打通"能产出那份表"）✅ 完成（2026-06-19）
- [x] M1.1 `export-templates.ts`：`ExportTemplateKind` + `FlatExportTemplate`/`PivotExportTemplate` 判别联合；现 `v5-20260618` 标 `kind:"flat"`，抽出 `writeTemplateSheet` 为 flat 渲染（行为不变）
- [x] M1.2 `renderWorkbook(workbook, template, rows, scenarioId)` 统一入口，按 kind 分派
- [x] M1.3 pivot 构建：分组（code+name）/ sheet 名安全化+去重+31字符截断 / 目录 sheet（序号·产品名，每栏 200 行列优先填充）/ 单产品 sheet（合并标题、月份列降序、qty 落格）
- [x] M1.4 评估列计算：`评估单价=mean(price>0)`、`评估金额=评估单价×Σqty`，写首条数据行，numFmt `#,##0.00`
- [x] M1.5 注册 `purchase-stats-20260619`（pivot，声明 `scenarioId:"grocery"`、filename）
- [x] M1.6 `exports.ts` `buildRecognitionExport(templateId)` 改用 `renderWorkbook`；pivot 用 buffer 版（非流式），flat 仍可流式；route 按 kind 分派（pivot→buffer / flat→stream）
- [x] M1.7 单测：透视分组/月份降序/数量落格/评估列/sheet 名安全化；`v5-20260618` 列回归不变（50/50 通过）
- [x] M1.8 运行时：写盘→exceljs 读回校验 sheet 数/合并标题/表头/月份格值/评估列 + 边界（空编码/超长名31字符/price=0排除）→ 通过

## M2. 选择性导出（批次 + 当前筛选）✅ 完成（2026-06-19）
- [x] M2.1 `exports.ts`：`ExportScope` 类型 + `scopeToWhere(scope)`（镜像 rows API 筛选语义），`buildRecognitionExport`/`streamRecognitionExport` 接 scope；缺省=全库（兼容）
- [x] M2.2 `POST /api/exports/recognition` body 扩展 `{ templateId?, scope? }`，Zod 校验
- [x] M2.3 `ExportMenu` 接 `scope` props（结果页传当前筛选；批次详情页传 batchId）
- [x] M2.4 结果页传当前筛选、批次详情页头部新增「按本批次导出」入口；下拉显示"导出范围：当前筛选/批次 vs 全部结果"
- [x] M2.5 单测：scopeToWhere 各字段 + 空值忽略 + rowIds；DB 集成测试：按 name 过滤=1 行、不存在 batchId=空表
- [ ] （下一期）行级多选 checkbox 列 + `scope.rowIds`（后端已就绪）

## M3. 批次绑定模板 + scenario 驱动抽取
### M3a 数据模型 + 创建 UI + 绑定 ✅ 完成（2026-06-19）
- [x] M3a.1 Prisma：Batch 加 `exportTemplateId String?` + `scenarioId String?`，`prisma db push`（本项目用 db push 演进）+ `prisma generate`
- [x] M3a.2 `batchCreateSchema` + create 写两字段，场景由 `exportTemplateId` 派生（选模板带出 grocery）再回退；GET include 默认返回两字段
- [x] M3a.3 `CreateBatchPayload` + `CreateBatchDrawer` 加"导出模板"下拉（GET /api/exports/templates，原生 select，无 emoji）
- [x] M3a.4 批次详情页 ExportMenu 接 `defaultTemplateId={batch.exportTemplateId}` + `scope.batchId`：一键直出绑定模板，多模板可下拉切换
- [x] M3a.5 DB 集成测试：批次绑定模板 + 派生场景往返（54/54 通过）

### M3b 识别链路动态化（grocery 行为保持）✅ 完成（2026-06-19）
- [x] M3b.1 `schema.ts`：`buildExtractionRowSchema`/`buildExtractionResultSchema` 动态 zod + `normalizeExtractionWith`（拆核心列/extra）；`extractionResultSchema`/`normalizeExtraction` 保留为 grocery 默认
- [x] M3b.2 `settings.ts`：`buildRecognitionPrompt(scenario, fields)`，grocery 返回内置默认（零变更），非默认按字段标签/hint 生成
- [x] M3b.3 `provider.ts`：`ExtractionConfig` 注入（schema+normalize）+ `extractionConfigForScenario`；`createRecognitionProvider(target, prompts, extraction)`；`resolveProviderPrompts` 加 fallback 参数
- [x] M3b.4 worker `scenarioContext(job)` 透传 `batch.scenarioId`（主/副/审核三处 provider），按 hasExtra 落 extraJson
- [x] M3b.5 单测：grocery 动态↔默认 schema 等价、prompt 生成、extra 拆分、默认场景复用；类型/lint/58 测试/`next build` 全过

## M4. 导出模式（新建/追加/合并，上传基准并入）
- [ ] M4.1 `POST /api/exports/recognition` 支持 `multipart`（`baseFile` + `meta`），`mode: new|append|merge`
- [ ] M4.2 `exports.ts`：读基准 xlsx（exceljs `load`）+ 结构校验（目录 + 产品 sheet 表头匹配）；pivot 并入（补产品 sheet / 补月份列 / append 行）；flat 并入（表尾续写）
- [ ] M4.3 `apiDownload` 扩展支持 `FormData` body（带文件下载）；`ExportMenu` 加模式选择 + 文件上传（pivot 模板才出"上传基准"）
- [ ] M4.4 `ExportRecord` 落库：`{ batchId, type, templateId, filterJson(scope), mode, rowCount }`
- [ ] M4.5 单测：append 产品并集 + 月份并集 + 行追加；结构不符报错；运行时上传样本 xlsx 校验行增长

## F. 质量门 / 交付
- [ ] F1 `npm run build` + lint 零错误
- [ ] F2 `npm test`（隔离 test.db，[[nice-ocr-test-setup]]）全绿，含新增单测；现有 22 测试不回归
- [ ] F3 运行时冒烟：批次选模板→抽取→选择性导出→追加，逐项截图/exceljs 留证（[[nice-ocr-next-start-port-gotcha]]）
- [ ] F4 更新 output/nice-ocr-architecture.md + 本 change 的 proof-pack
