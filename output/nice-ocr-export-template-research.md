# nice-ocr 选择性导出 + 导出模式 + 批次绑定 Excel 模板 研究笔记

> 阶段: research（evolve 模式，承接已落地的 `field-schema-templates`）
> 更新: 2026-06-19
> 范围: ①选择性导出 ②导出模式（新建/追加/合并）③批次绑定 Excel 模板（多 sheet 透视：副食品采购统计表）
> 参考实现/模板源: `docs/v5_new_3 2/`（v5 工具 + `副食品采购统计表_蔺嘉琪260611(1).xlsx`）

---

## 〇、这个需求之前做到哪了（git + 代码核对结论）

**之前谈过，且"导出模板体系"的地基已经落地**（commit `1a04ff2` / `caf06e7`，change `field-schema-templates`），但**本次三个新诉求都还没做**：

| 能力 | 现状 | 本次诉求 |
|---|---|---|
| field-schema 单一事实源 | ✅ 已落地 [field-schema.ts](nice-ocr/src/lib/fields/field-schema.ts) | 复用，新增模板挂载点 |
| 导出模板注册表 + 共享样式引擎 | ✅ 已落地 [export-templates.ts](nice-ocr/src/lib/workflows/export-templates.ts)，但**仅支持单 sheet 平铺**（`resolveColumns` → 一张表） | 需泛化到**多 sheet 透视** |
| 内置模板 | ✅ 仅 `v5-20260618`（14 列平铺，v5 精确复刻，默认） | 新增 `purchase-stats-20260619`（采购统计表布局） |
| 导出范围 | ❌ **全库导出**（`where:{ deletedAt:null }`，连批次都不分）[exports.ts:27](nice-ocr/src/lib/workflows/exports.ts#L27) | **选择性导出**（按批次/筛选/选中行） |
| 导出模式 | ❌ 只有"新建一份" | 新增**追加 / 合并** |
| 批次绑定模板 | ❌ Batch 无 `exportTemplateId`/`scenarioId` 字段 | 创建批次时选模板，抽取与导出都走该模板 |
| 行级多选 | ❌ 结果表/审核台无 rowSelection | 选择性导出的可选输入 |
| `ExportRecord` 导出历史表 | ⚠️ schema 已建但**完全没被写入** | 追加/合并的基准可来源于它 |

> 结论：地基（模板注册表 + 样式引擎 + field-schema）可直接复用；本次是在其上**泛化模板形态 + 增加范围/模式/批次绑定**，属增量演进，非推倒重来。

---

## 一、参考模板剖析：`副食品采购统计表_蔺嘉琪260611(1).xlsx`

用 exceljs 实测解析（非肉眼）结论：

### 1. 整体结构
- **共 1210 个 sheet** = 1 个「目录」+ 1209 个「单产品」sheet。
- **零公式、零合计行**（`CELLS_WITH_FORMULA=0`，无"合计/总计/小计"）。用户说的"计算"**不是 Excel 公式，而是数据透视/分组重排**——把平铺的识别行按"产品 × 月份"透视成每产品一张表。

### 2.「目录」sheet（索引页）
- 表头重复 7 组：`序号 | 产品名`（共 14 列），把 ~1209 个产品横向分 7 栏排满，纯索引/导航用途。
- `产品名` = `编码+名称` 拼接（如 `100001土豆`），**与对应单产品 sheet 的 sheet 名完全一致**。

### 3. 单产品 sheet（如 `100001土豆` / `100005白萝卜`）
- **R1**：合并单元格标题 `{名称}采购统计表`（A1:H1 或 A1:G1，跨满列宽）。
- **R2 表头**：`序号 | 单位 | {月份列…降序} | 评估单价 | 评估金额 | 备注`。
- **月份列动态**：列数随该产品实际出现的月份变化——1179 张表 7 列（2 个月）、30 张表 8 列（3 个月）。样本月份集仅 `2020年1月 / 2019年12月 / 2019年11月`，**降序**排列。
- **R3+ 数据行**：每行一条采购记录——`序号`=该产品在目录里的序号（同一表内恒定，如白萝卜全是 7）、`单位`=单位、**数量落在它所属月份那一列**、其余月份列留空、`评估单价/评估金额` **全空**（人工评估占位列）、`备注`=备注。

### 4. 与我们数据模型的契合度（关键利好）
- 透视所需字段 = `编码/名称/单位/数量/月份`，**全部已被 grocery 场景识别并入库**（[field-schema.ts:85](nice-ocr/src/lib/fields/field-schema.ts#L85)），抽取侧零缺口。
- 月份格式天然对齐：我们的 [normalizeMonth](nice-ocr/src/lib/validation/rules.ts#L33) 产出 `"2024年6月"`，与 xlsx 表头 `"2020年1月"` **同构**，透视取值零转换。
- 因此本模板**主要改的是"导出布局（透视）"**，不需要改抽取链路——这也正好满足"做好兼容、兼容后续处理"。

---

## 二、v5 现有导出（`server.js /api/export`）对照
- v5 的 `/api/export` 产出的是**14 列平铺单表**（我们已 1:1 复刻为 `v5-20260618`），**并不会**生成那份多 sheet 采购统计表——后者是"别人手工/另案处理好的成品文件，含数据但非模板"。
- 所以本次要做的，是把那份成品文件的**布局抽象成一个可复用模板**，由系统从识别数据自动生成（透视），并支持把新数据**追加进**已有的那种文件。

---

## 三、本次三大能力的现状缺口（改造地图）

### A. 选择性导出
- 现状：`buildRecognitionExport`/`streamRecognitionExport` 写死 `where:{ deletedAt:null }`，**全库**。
- 已具备：rows API 已支持 `batchId/status/risk/auditState/month/code/name` 筛选 [rows/route.ts](nice-ocr/src/app/api/rows/route.ts)；`apiDownload` 支持自定义 body；结果页已维护筛选 state。
- 缺口：①导出函数需接收 `filter`/`rowIds` 并下推到 where；②API 需透传范围参数；③（行级多选）结果表需加 rowSelection（当前无）。

### B. 导出模式（新建/追加/合并）
- 现状：只有"新建一份新工作簿"。
- 缺口：①请求需带 `mode` + 基准文件来源；②追加/合并需**读已有 xlsx**（exceljs `readFile`/`load`）并把新数据并进去（平铺=续写行；透视=补行/补月份列/补产品 sheet）；③需定义基准文件来源（上传 vs 服务端 `ExportRecord` 累积）。

### C. 批次绑定 Excel 模板
- 现状：模板是导出时临时选；Batch 无模板/场景字段；`ExportTemplate` 接口只支持单 sheet 平铺。
- 缺口：①Batch 加 `exportTemplateId`（可选 `scenarioId`）一次迁移；②创建批次 UI 加模板选择 [action-dialogs.tsx](nice-ocr/src/components/dialogs/action-dialogs.tsx)；③`ExportTemplate` 接口泛化出"渲染策略"（flat / pivot）；④导出在批次上下文默认用绑定模板。

---

## 四、不变约束（继承全局 + 既有文档）
- 图标只用 lucide-react；禁紫粉渐变 / emoji 图标 / 默认字体直出。
- 前端 fetch URL 经 `apiPaths` 常量与后端对齐 [paths.ts](nice-ocr/src/lib/api/paths.ts)。
- 复用既有 design token、Button/select、`writeTemplateSheet` 样式引擎，不引入新 UI/Excel 体系。
- exceljs 4.4 / Next 16 / React 19 / Prisma 7（已核对 package.json）。
- 迁移零破坏：新字段可空，老批次/老导出行为不变（见 [[nice-ocr-extensibility-preference]]、[[prisma-generate-required]]）。

---

## 五、待用户确认的关键决策（见设计文档 + 文档确认门提问）
1. 追加/合并的**基准文件来源**：上传已有 xlsx 并入（推荐，无状态）vs 服务端按模板维护累积文件。
2. `评估单价/评估金额`：保持空列人工填（与样本一致，推荐）vs 系统计算（均价 / 单价×数量）。
3. 选择性导出**首期范围**：按批次+当前筛选（不改表格，快）先上，行级多选作第二步 vs 首期就要行级多选。
4. 批次绑定是否**同时绑定 scenario**（影响抽取）：本期模板抽取沿用 grocery，仅绑定导出模板 vs 现在就接通"模板声明 requiredFields 驱动抽取"。
