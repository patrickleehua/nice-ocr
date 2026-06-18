# Proof Pack: field-schema-templates

> 验证日期：2026-06-18 ｜ 范围：编辑抖动修复 + Excel 导出模板（v5 精确复刻）+ 字段可扩展基座

## 1. 质量门
| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx tsc --noEmit` | 0 错误 |
| 生产构建 | `npm run build` | ✓ Compiled successfully；新路由 `/api/fields`、`/api/exports/templates` 已注册 |
| Lint | `npm run lint` | 0 错误 0 警告 |
| 单测 | `npm test`（隔离 test.db） | 22/22 通过（含新增 4 个导出模板测试） |

## 2. 编辑抖动修复（运行时实测，Playwright）
- 结果表渲染为**常驻输入框**（不再「点击切换 DOM」）→ 消除布局位移。
- 程序化编辑第一行数量（26.5→33.5）后：
  - `orderUnchanged: true`（整表行序不变）
  - `firstRowStillSame: true`（被编辑行**不跳顶**）
  - `committedQty: "33.5"`（乐观更新 + 后台 PATCH 提交成功）
- 控制台错误：0。
- 机制：常驻输入框（`field-cell.tsx`）+ 乐观更新（`setQueryData`，不全表 invalidate）+ rows API 稳定排序（`createdAt desc, rowIndex asc`）。
- 测试数据已还原（黄油 qty 回到 26.5）。

## 3. Excel 导出（运行时实测）
- `GET /api/exports/templates` → 仅 `v5-20260618`（单模板）。
- `POST /api/exports/recognition`（默认）→ 文件名 `recognition_result.xlsx`（v5 原名），有效 xlsx。
- 列校验：`EXACT_MATCH_V5: true` —— 14 列 `图片名/图片标签/原始日期/归一化月份/商品编码/商品名/单位/数量/单价/金额/状态/备注/资料库冲突/冲突原因`，与 `docs/v5_new_3 2` `/api/export` **完全一致**。
- 样式：深色表头 `FF2D3748` + 加粗、冻结首行、数字格式 `#,##0.##`/`#,##0.00`、CJK 自适应列宽。
- 单测锁定：`export-templates.test.ts` 断言 v5 列契约 + 取值映射（状态→中文、资料库冲突=conflictState、冲突原因=riskReasonsJson、extra 字段读 extraJson）。

## 4. 可扩展基座（已就绪）
- `field-schema.ts` 单一事实源（FieldDef + 场景）；`RecognitionRow.extraJson` 已迁移（dev.db 已 push）。
- 结果表/审核台按场景字段**动态出列**（核心列 + extraJson 列）；导出模板系统就绪，新增模板=注册表加一项。
- 识别动态化为**就绪扩展点**（当前 grocery 单场景=v5 识别列，对应关系成立；实时 worker 接通/新增场景时再激活动态 schema/prompt）。

## 5. 已知边界 / 后续
- 仅内置 v5 模板（按用户要求删除 concise/by-month）；前端单模板直接导出，≥2 模板自动出选择下拉。
- 在线「字段构建器 UI」「实时识别 worker 接通动态抽取」为后续迭代。
