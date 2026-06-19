# nice-ocr 选择性导出 + 导出模式 + 批次绑定模板 设计/实现规划

> 阶段: design（research 已产出 [nice-ocr-export-template-research.md](nice-ocr-export-template-research.md)）
> 更新: 2026-06-19
> 原则: 复用既有模板注册表/样式引擎/field-schema；增量演进；迁移零破坏；可扩展（兼容后续模板）

## 〇、决策锁定（2026-06-19，用户确认）
1. **追加/合并基准** = 前端**上传已有 xlsx 并入**（无状态）；不做服务端累积文件。
2. **评估单价/评估金额** = **系统计算填充**：`评估单价 = 该产品识别行 price 的均值（仅计 price>0 的行）`，`评估金额 = 评估单价 × 该产品 qty 合计`；写在每个产品 sheet 的**首条数据行**（单产品一组评估值），其余行该两列留空。两列 numFmt 均 `#,##0.00`。
3. **选择性导出首期** = **按批次 + 当前筛选**（scope 下推 where，不改表格结构）；行级多选 checkbox 列入**下一期**。
4. **批次绑定** = 同时绑 `exportTemplateId` **与 `scenarioId`**，并**本期接通 scenario 驱动抽取**（动态 schema + 动态提示词 + provider 注入），承接上次延后的 task D。grocery 场景生成的 schema/提示词与现状等价（行为保持），机制通用化。

---

## 一、核心抽象：把 `ExportTemplate` 从"单表列定义"泛化为"工作簿渲染策略"

现状接口只表达单 sheet 平铺（`resolveColumns → FieldDef[]`），无法承载多 sheet 透视。引入 `kind` 区分，并把"怎么写工作簿"收敛为统一入口 `renderWorkbook`，新增模板只需加一种策略，**不改调用方**（这是"兼容后续处理"的关键）。

```ts
// export-templates.ts（演进，向后兼容）
export type ExportTemplateKind = "flat" | "pivot";

interface ExportTemplateBase {
  id: string; name: string; description: string; filename: string;
  kind: ExportTemplateKind;
  /** 该模板期望的场景；null=沿用全局/批次场景。为"模板驱动抽取"预留 */
  scenarioId?: string | null;
}

// flat：现有 v5-20260618 走这里，行为完全不变
interface FlatExportTemplate extends ExportTemplateBase {
  kind: "flat";
  sheetName: string;
  resolveColumns: (scenarioFields: FieldDef[], metaFields: FieldDef[]) => FieldDef[];
}

// pivot：副食品采购统计表布局
interface PivotExportTemplate extends ExportTemplateBase {
  kind: "pivot";
  pivot: {
    tocSheetName: string;            // "目录"
    groupKey: (row) => { code; name; sheetName; label }; // 产品分组键（code+name）
    monthField: "normalizedMonth";   // 透视的列维度
    valueField: "qty";               // 落格的值
    fixedCols: FieldDef[];           // 序号/单位（前）
    tailCols: FieldDef[];            // 评估单价/评估金额/备注（后，可空占位）
    tocColumnsPerPage?: number;      // 目录横向分栏数（默认 7，对齐样本）
    sheetTitleSuffix: string;        // "采购统计表"
  };
}

export type ExportTemplate = FlatExportTemplate | PivotExportTemplate;

/** 统一渲染入口：按 kind 分派；flat 复用 writeTemplateSheet，pivot 走透视构建 */
export async function renderWorkbook(
  workbook: ExcelJS.Workbook, template: ExportTemplate, rows: ExportSourceRow[], scenarioId: string|null
): Promise<void>
```

- **flat**：抽出现有 `writeTemplateSheet` 逻辑（深色表头/numFmt/CJK 列宽/冻结首行）原样复用，`v5-20260618` 零变化。
- **pivot**（见下）：先分组 → 写目录 → 逐产品写 sheet。

### pivot 构建算法（对齐样本，纯透视无公式）
输入 = 作用域内的行（已按选择性导出过滤）。
1. **分组**：按 `code+name` 取产品键，`sheetName = 安全化(code+name)`（Excel 限制：≤31 字符、去 `: \ / ? * [ ]`、重名加序号去重）。产品按"目录序号/首次出现"稳定排序。
2. **目录 sheet**：`序号 | 产品名` 成对，按 `tocColumnsPerPage`（默认 7）横向分栏排满；产品名=`code+name`，与 sheet 名一致。
3. **逐产品 sheet**：
   - R1 合并标题 `{name}采购统计表`（跨该表总列宽）。
   - 月份列 = 该产品实际出现的 `normalizedMonth` 集合，**降序**（字符串"YYYY年M月"已与样本同构，零转换；排序按解析出的 年*12+月）。
   - R2 表头：`序号 | 单位 | {月份…} | 评估单价 | 评估金额 | 备注`。
   - R3+：每条记录一行，`数量` 落在其月份列，其余列照填。
   - **评估列（决策2，系统计算）**：`评估单价 = mean(price where price>0)`、`评估金额 = 评估单价 × Σqty`，写在该产品**首条数据行**的对应两列，其余行留空；numFmt `#,##0.00`。
   - 套用共享样式（表头底色/列宽/冻结首行）。
- **内存**：pivot 需全量行在内存分组，**不走流式**（per-batch 数据量可控，几千行无压力）；流式仅 flat 模板保留。

---

## 二、数据模型（Prisma 迁移，零破坏）

```prisma
model Batch {
  // …既有字段不动…
  exportTemplateId String?   // 绑定导出模板；null=用默认模板
  scenarioId       String?   // 绑定抽取场景（决策4，本期接通）；null=回退全局活动场景
}
```
- `prisma generate` + migrate（见 [[prisma-generate-required]]）。老批次为 null，导出时回退默认模板，行为不变。
- `ExportRecord`（已存在）开始**真正写入**：每次导出落 `{ batchId, type, templateId, filterJson, rowCount, mode, filePath? }`，作为"追加/合并"的可选基准与审计。

---

## 三、选择性导出（范围）

### 后端
- `buildRecognitionExport` / pivot 构建统一接收 `scope`：
  ```ts
  interface ExportScope { batchId?: string; status?: string; risk?: string;
    auditState?: string; month?: string; code?: string; name?: string; rowIds?: string[]; }
  ```
  解析成 Prisma `where`（复用 rows API 既有筛选语义；`rowIds` → `id in [...]`）。缺省=全库（保持兼容）。
- API `POST /api/exports/recognition` body 扩展：`{ templateId?, scope?, mode?, ... }`。

### 前端
- `ExportMenu` 接收 `scope` props（来自结果页当前筛选 / 批次详情页的 batchId）。导出下拉里给"范围"提示（如"按当前筛选导出 / 导出本批次"）。
- **行级多选（决策3 定首期是否做）**：结果表 `DataTable` 增加 checkbox 列 + `selectedRowIds` state（受控，不引第三方），勾选后 `scope.rowIds` 生效；"全选"按当前筛选集。

---

## 四、导出模式（新建 / 追加 / 合并）

| 模式 | 语义 | 实现要点 |
|---|---|---|
| **新建** new | 用作用域数据生成全新工作簿（现状行为） | 默认；`renderWorkbook` 直出 |
| **追加** append | 把作用域新数据**并入一份已有同模板工作簿** | 读基准 xlsx（exceljs `load`）→ pivot：定位/新建产品 sheet、补月份列、append 行；flat：表尾续写行 |
| **合并** merge | 把多来源（多批次/多次导出）**汇成一份** | 本质=对多个作用域反复 append；pivot 下按产品键并集、月份列并集去重 |

- **基准文件来源（决策1，已锁定）**：**前端上传已有 xlsx**（`multipart/form-data` 带 `baseFile` + JSON `meta`），无状态、直接支持"把新识别数据追加进那份已处理好的副食品采购统计表"。不做服务端累积文件。
- 追加/合并仅对 **pivot/flat 同模板** 生效；模板不匹配则报错提示（前端校验 + 后端兜底）。
- 上传基准文件需结构校验（含「目录」+ 至少一个产品 sheet 表头匹配）；不符则友好报错，不静默写坏。

---

## 五、批次绑定模板（贯穿创建→抽取→导出）

1. **创建批次**：`CreateBatchDrawer` [action-dialogs.tsx](nice-ocr/src/components/dialogs/action-dialogs.tsx) 加"导出模板"下拉（来自 `GET /api/exports/templates`，lucide 图标，无 emoji，复用既有 select 样式）；选模板时**自动带出该模板声明的 `scenarioId`**（模板→场景一一对应，用户无需再单独选场景）。`batchCreateSchema` + create 写 `exportTemplateId` 与 `scenarioId`；`CreateBatchPayload` 扩展两字段。
2. **抽取（决策4，本期接通 scenario 驱动）**：
   - `schema.ts` 加 `buildExtractionRowSchema(fields)`/`buildExtractionResultSchema(fields)`：按场景字段动态生成 zod 行 schema；保留 `extractionResultSchema` 作为 grocery 等价默认与既有测试基线。
   - `settings.ts` 加 `buildRecognitionPrompt(scenario, fields)`：按字段 + `recognitionHint` 生成提示词；grocery 文案与现 `defaultRecognitionPrompts` 等价。
   - `provider.ts`：`createConfiguredRecognitionProvider(scenarioId?)` 与 `createRecognitionProvider(target, prompts, schema, normalize)` **注入动态 schema/normalize**，替换写死的 `extractionResultSchema`（OpenAI `zodTextFormat` / Anthropic `zodOutputFormat` 用注入 schema）。
   - `normalizeExtraction` 拆 `{核心列}`+`{extraJson}`（grocery 无 extra 字段，行为不变）。
   - worker 调用点把 `batch.scenarioId` 透传给 provider 创建（与既有 `resolveRecognitionProviders(batch)` 的批次级模型解析并列）。
3. **导出**：批次详情页导出时，`templateId` 缺省取该批次 `exportTemplateId`；`scope.batchId` 自动带上 → 天然"按本批次 + 本模板导出"。pivot 透视用的 scenario 取批次 `scenarioId`（回退全局）。

---

## 六、API / 路径（前后端对齐，apiPaths 常量）
- `POST /api/exports/recognition`：body `{ templateId?, scope?, mode?: "new"|"append"|"merge" }`；append/merge 时改 `multipart`（`baseFile` + `meta`）。
- `GET /api/exports/templates`：返回值加 `kind`，前端按 kind 决定是否提供"上传基准文件"。
- `apiPaths` 既有 `exportsRecognition/exportsTemplates/exportsProducts` 复用；新增 `apiDownloadUpload`（带文件的下载）封装或扩展 `apiDownload` 支持 `FormData` body。

---

## 七、验证策略
- **单测**：pivot 透视（分组/月份列动态/序号/空评估列）、sheet 名安全化与去重、月份降序、append 合并（产品并集 + 月份并集 + 行追加）、选择性 where 下推、`v5-20260618` flat 回归不变。
- **运行时**：`npm run build` 零错误；起服务后：①创建批次选 `purchase-stats-20260619`；②导出 → 用 exceljs 校验产出 sheet 数/表头/某产品某月份格值；③上传样本 xlsx 走 append，校验行数增长；④`v5-20260618` 导出与现状逐列一致（回归）。（见 [[nice-ocr-test-setup]]、[[nice-ocr-next-start-port-gotcha]]）
- **回归**：现有 22 个单测保持全绿。

---

## 八、分期建议（前端优先 + 运行时验证，按功能点逐个 commit 见 [[commit-per-feature-point]]）
- **M1 模板泛化 + pivot 模板**：泛化 `ExportTemplate`（`kind: flat|pivot` + `renderWorkbook`），落 `purchase-stats-20260619`（目录 + 单产品透视 + 评估列计算），`v5-20260618` flat 回归不变。单测 + 运行时 exceljs 校验产出。（先把"能产出那份表"打通，不触碰 UI/范围/模式）
- **M2 选择性导出**：`ExportScope` 下推 where + API 透传 + ExportMenu 接 scope（批次/当前筛选）。行级多选**下一期**（决策3）。
- **M3 批次绑定 + scenario 驱动抽取**：
  - M3a Batch 加 `exportTemplateId`/`scenarioId` 迁移 + 创建 UI 模板下拉（带出 scenario）+ 批次上下文默认模板。
  - M3b 识别链路动态化（`buildExtractionRowSchema`/`buildRecognitionPrompt`/provider 注入 + worker 透传 batch.scenarioId），grocery 行为保持。
- **M4 导出模式**：append/merge（上传基准 xlsx 并入）+ 结构校验 + ExportRecord 落库。

> 每个 Mx 完成跑 build/lint/test，并按文件隔离提交（见 [[nice-ocr-concurrent-dev]]、[[commit-per-feature-point]]）。

---

## 九、风险与取舍
- pivot 不流式：超大批次（数万行）内存上升——可接受（单批次量级有限）；必要时按产品分块写。
- sheet 名 31 字符上限 + 重名：必须安全化+去重，否则 exceljs 抛错——已纳入算法与单测。
- append 读外部 xlsx：用户上传的文件可能与模板结构不符——需结构校验与友好报错，不静默写坏。
- `评估单价/评估金额`：默认留空与样本一致；若改为计算需明确口径（均价/加权），见决策2。
