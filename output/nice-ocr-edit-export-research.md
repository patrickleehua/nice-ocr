# nice-ocr 表单编辑抖动 + Excel 模板导出 研究笔记

> 阶段: research（patch 模式）
> 更新: 2026-06-18
> 范围: 修复结果表/审核台编辑抖动 + 重构 Excel 导出为可扩展模板体系
> 参考实现: `docs/v5_new_3 2`（原始 v5 工具，用户认可"做得比较好"）

---

## 一、问题 1：点击表单数据编辑时页面抖动

### 现状实现
- 内联编辑组件 [editable-cell.tsx](nice-ocr/src/components/ui/editable-cell.tsx) 在「展示态」与「编辑态」之间切换两套**完全不同的 DOM**：
  - 展示态：`<td>{display}</td>`（继承 `tableCellClass` 内边距）
  - 编辑态：`<td className="p-1"><input className="h-7 ..."/></td>`（不同内边距 + 固定高度 input）
- 提交回调链：`onCommit` → [results-page.tsx:106](nice-ocr/src/components/results/results-page.tsx#L106) `updateRow.mutate` → `onSuccess: invalidate` → `queryClient.invalidateQueries(["rows"])` → 全表重新拉取并重渲染。
- 行查询排序：[rows/route.ts:24](nice-ocr/src/app/api/rows/route.ts#L24) `orderBy: { updatedAt: "desc" }`。

### 抖动根因（两个独立成因，叠加放大）
1. **布局位移（layout shift）**：展示态 `<td>` 与编辑态 `<td><input h-7></td>` 的盒模型（高度/内边距）不一致；表格未使用固定布局（`table-fixed`），列宽随内容重算。点击瞬间单元格尺寸变化 → 整行/整列跳动。
2. **行位置跳变（row jump）**：编辑提交后该行 `updatedAt` 刷新，`invalidateQueries` 触发全表重拉，服务端按 `updatedAt desc` 排序 → **被编辑的行瞬间跳到列表顶部**，且全表经历 loading→新数据闪烁。这是用户感知到的"大抖动"。

### 参考实现 v5 为什么不抖（`public/app.js`）
- 每个可编辑单元格**始终渲染为固定宽度 `<input>`**（`<input ... onchange="ef(idx,'code',this.value)" style="width:76px">`），不存在展示/编辑两态切换 → 无 DOM 替换、无布局位移。
- `ef(idx, field, value)` 只更新**本地内存数组** `allRows[idx]` 并调用防抖保存 `sched()`（4s 后落盘），**不重排、不重渲染、不回拉服务端** → 输入框保留原值，行不移动。
- 排序保持原始顺序，编辑永远不改变行位置。

### 可选修复策略（待确认交互模型）
- **方案 A（推荐，保留现有点击编辑 UX）**：
  1. 表格容器加 `table-fixed` + 列宽定义；让 EditableCell 展示态/编辑态盒模型完全一致（相同 padding/高度），消除布局位移。
  2. 提交改为**乐观更新**：用 `queryClient.setQueryData` 就地更新该行而非全量 `invalidate`；后台静默校正。
  3. 行排序改为**稳定键**（`createdAt asc` 或 `id`），编辑不再让行跳顶。
- **方案 B（贴近 v5）**：可编辑列改为**常驻 input**，本地状态驱动 + 防抖批量保存，彻底消除两态切换。改动更大、视觉更"表单化"。

> 注：`EditableCell` 同时被 [results-page.tsx](nice-ocr/src/components/results/results-page.tsx) 与 [review-page.tsx](nice-ocr/src/components/review/review-page.tsx) 使用，修复对两处同时生效。

---

## 二、问题 2：Excel 导出逻辑 + 内置模板选择

### 现状实现
- [exports.ts](nice-ocr/src/lib/workflows/exports.ts) `buildRecognitionExport` 把所有行平铺进单一 sheet，**无表头样式、无数字格式、无冻结首行、无自适应列宽、无模板概念**。
- 导出 API [exports/recognition/route.ts](nice-ocr/src/app/api/exports/recognition/route.ts) 为无参 `POST`，前端 [results-page.tsx:128](nice-ocr/src/components/results/results-page.tsx#L128) 单按钮直出。

### 参考实现 v5 的导出（`server.js` `/api/export`，做得好的地方）
- 表头样式：加粗白字 + 深色填充 `FF2D3748` + 居中（`server.js:425-429`）。
- 数字格式：`qty=#,##0.##`、`price=#,##0.00`、`amount=#,##0.00`（`server.js:448-450`）。
- **CJK 感知自适应列宽**：中文字符按 2 宽度估算，上限 40（`server.js:454-461`）。
- **冻结首行**：`sheet.views = [{ state:'frozen', ySplit:1 }]`（`server.js:462`）。
- 字段更完整：图片名/图片标签/原始日期/归一化月份/编码/名称/单位/数量/单价/金额/状态/备注/资料库冲突/冲突原因。

### 目标：可扩展模板体系
- 抽出**模板注册表** `src/lib/workflows/export-templates.ts`：每个模板声明 `{ id, name, description, sheetName, filename, columns[], freezeHeader, autoWidth, numFmt }`，新增模板只需往注册表加一项。
- 抽出**共享样式引擎**（表头样式 + 数字格式 + CJK 自适应列宽 + 冻结首行），所有模板复用，对齐 v5 质量基线。
- 内置模板（首批，可后续扩展）：
  1. `standard` 标准全字段 — 对齐 v5 字段集 + 样式（默认）。
  2. `concise` 精简交付版 — 仅核心列（月份/编码/名称/单位/数量/单价/金额）。
  3. （可选扩展示例）`by-month` 按月份分 Sheet。
- API：`POST /api/exports/recognition` 接收 `{ templateId }`（缺省回退 `standard`），`apiDownload` 已支持自定义 `init.body`，无需改下载封装。
- 前端：导出按钮旁增加模板选择（下拉/分组菜单），图标用 lucide（禁 emoji）。

---

## 三、不变的约束（继承自既有文档与全局规则）
- 图标只用 lucide-react；禁紫粉渐变 / emoji 图标 / 默认字体直出。
- 前端 fetch URL 与后端路由经 `apiPaths` 常量对齐。
- 复用既有 design token、`Button`、`select` 样式，不引入新 UI 体系。
- exceljs 4.4（已安装），Next 16 / React 19；写代码前已核对依赖版本。

---

## 四、待用户确认的关键决策
1. 编辑交互模型：方案 A（保留点击编辑、修掉两个抖动成因，推荐）还是方案 B（贴近 v5 常驻输入框）。
2. 首批内置模板范围：标准全字段 + 精简版（推荐）是否够用，是否要按月份分 Sheet。

> 确认后才进入 Spec/tasks 与编码（前端优先 + 运行时验证）。
