# Tasks: ui-refine-config-pass（布局固定 + 内联编辑 + 文档可视化过滤 + 全列表分页 + 可配置提示词/双模型交叉验证 + 导入编码修复）

> 来源：用户上线试用后的一批反馈（2026-06-17）。已对齐两项架构决策：
> - 多模型搭配 = **双模型交叉验证**（pass1=主模型、pass2=副模型，两次一致才 AI 自动通过；设置/批次可选）。
> - OCR 提示词 = **按 Provider 覆盖**（全局默认 + 每 provider 可单独覆盖）。
> 原则：约定大于配置、避免过度；每个功能点完成即 `git commit`。

## 反馈→任务映射
1. 左侧导航固定、右侧拆分、系统固定高度超出滚动 → FP1。
2. 导入文件中文乱码 → FP8。
3. 审核台可直接在原数据上内联编辑 → FP5。
4. 图片预览下方文档选择器优化（几百张可维护 + 可视化过滤“做了哪些”）→ FP5。
5. 识别明细点击位置即可内联编辑 → FP5。
6. 全部结果“编辑识别行”由弹窗表单改为内联编辑（参考旧方案）→ FP6。
7. OCR 识别提示词可配置 → FP3 + FP4。
8. 模型提供商多个、多模型自由搭配、可配置 → 双模型交叉验证（FP3 + FP4）。
9. 所有大列表加分页（避免过度）→ FP7（结果页已具备）。

## 功能点（每点一次 commit）
- [ ] **FP1 布局固定**：`app-shell` 根 `h-screen overflow-hidden`；侧栏固定且自身可滚；右列拆分为固定 header + 可滚 content；表头 sticky。
- [ ] **FP2 Schema**：`AiProviderConfig` 增 `systemPrompt String?` / `userPrompt String?`；`Batch` 增 `primaryProviderKey String?` / `secondaryProviderKey String?`（无级联，符合 AGENTS 约定）；`prisma db push`。
- [ ] **FP3 双模型交叉验证后端**：
  - `settings.ts`：`RecognitionDefaults` 增 `primaryProviderKey?` / `secondaryProviderKey?` / `systemPrompt` / `userPrompt`（全局默认）。
  - `provider.ts`：`createRecognitionProvider(config, prompts)` 接收解析后的 system/user 提示词；按 providerKey 取 provider；`getRecognitionProviderPair(batch)` 解析主/副。
  - `worker.ts`：pass1 用主模型、pass2 用副模型；提示词 = provider 覆盖 ?? 全局默认；副模型缺省时退化为主模型双跑。
  - `POST /api/batches`：接收 `primaryProviderKey` / `secondaryProviderKey`，缺省继承全局默认。
- [ ] **FP4 设置页**：全局 system/user 提示词文本框；每 provider 提示词覆盖文本框；主/副识别模型下拉（来自已启用 provider）；GET/PUT 完整 round-trip。
- [ ] **FP5 审核台**：识别明细内联编辑（code/name/unit/qty/price/amount，Enter/blur 提交、Esc 取消）；文档选择器换成可搜索 + 状态徽章 + 状态过滤 chips + 客户端分页的列表；扩展批次详情 API 返回每文档行状态汇总。
- [ ] **FP6 结果页**：移除弹窗编辑，改为内联编辑（复用 FP5 单元格组件）。
- [ ] **FP7 列表分页**：`batches` / `products` / `conflicts` API 加 `page`/`pageSize` 与服务端筛选；对应页加分页器（与结果页一致）。
- [ ] **FP8 导入编码**：`import/v5` 读取做 BOM 剥离 + UTF-8 严格解码 + GB18030 回退；核查并修复上传图片文件名中文显示。

## 验证
- `prisma generate` → `db push` → `npm run build` → `npm run lint`（0）→ `npm test`（≥ 既有 14 全绿）。
- 运行时：起 server + worker，用真实图片走一遍上传→识别→审核台内联编辑→结果页内联编辑→分页；Playwright 截图核对固定布局、内联编辑、文档过滤、控制台 0 错误。
- 切勿 `npm run db:seed`（会清空已配置的 AI Provider）。

## 不做（避免过度）
- 不做规则引擎/ N 模型投票（仅双模型交叉验证）。
- 不做表格虚拟化（页码分页足够）。
- 不做按批次/按文档级提示词（仅全局 + provider 覆盖）。
