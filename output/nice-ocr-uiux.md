# nice-ocr UI/UX Spec

> Super Dev core document 3/3  
> Status: draft for confirmation  
> Date: 2026-06-16

## 0. Confirmed Visual Reference

The user supplied `output/uiux.png` after approving the core documents. Treat this image as the visual reference for implementation:

- Overall tone: clean enterprise operations dashboard, dense but readable.
- Navigation: dark left sidebar with grouped app sections.
- Main pages: dashboard, batches list, batch detail, results list, review workbench, products/conflicts, import/settings, login/error states.
- Interaction model: right-side drawers/dialogs for create batch, edit row, confirm/cancel, and risk details.
- Components: compact metric cards, filter bars, paginated tables, status badges, split review workbench, thumbnails, form dialogs, loading/empty/error states.
- Implementation must still follow Super Dev constraints: Lucide icons only, no emoji, no purple/pink gradient theme, no marketing landing page.

## 1. Design Direction

nice-ocr should feel like a focused operations tool for people who process many documents repeatedly. It should be dense, calm, readable, and fast to scan.

Avoid:

- Landing page.
- Marketing hero.
- Decorative gradients.
- Purple/pink AI template palette.
- Emoji icons.
- Card walls with weak information hierarchy.
- Oversized typography inside dense workflows.

Use:

- Sidebar app shell.
- Table-first layouts.
- Split review workspace.
- Clear status badges.
- Compact filters.
- Keyboard-friendly review actions.
- Lucide icons.

## 2. UI Toolchain

Required:

- shadcn/ui components.
- Tailwind CSS.
- Lucide React icons.
- TanStack Table for data grids.
- TanStack Query for server state.
- TanStack Virtual for long lists/tables where needed.

Icon rule:

- All functional icons must come from Lucide.
- No emoji in UI code, labels, buttons, empty states, or placeholders.

## 3. Information Architecture

Primary navigation:

1. Dashboard
2. Batches
3. Results
4. Review
5. Products
6. Conflicts
7. Import
8. Settings

Suggested sidebar groups:

- Work
  - Dashboard
  - Batches
  - Results
  - Review
- Library
  - Products
  - Conflicts
- System
  - Import
  - Settings

Top bar:

- Current batch selector.
- Worker/provider status.
- Global search.
- Primary action: upload/create batch, depending on page.

## 4. Page Specs

### 4.1 Dashboard

Purpose:

- Show current operational state and what needs attention.

Content:

- Batch progress strip for active batch.
- Counts:
  - documents queued,
  - processing,
  - failed,
  - rows pending review,
  - conflicts open,
  - confirmed rows.
- Recent failures list.
- Review queue shortcuts:
  - high risk,
  - date errors,
  - amount mismatch,
  - product conflicts,
  - provider disagreement.

Layout:

- Full-width dashboard sections, not nested cards.
- Small repeated metric tiles are acceptable.
- Recent work table below metrics.

### 4.2 Batches

Purpose:

- Manage upload work packages and background recognition.

Content:

- Batch table with status, progress, document count, row count, failed count, strategy, created time.
- Create batch action.
- Upload action.
- Pause/resume/cancel actions.
- Retry failed documents action.

Batch detail view:

- Left/main: document list table.
- Right/side panel: selected document preview/status/attempts.
- Progress timeline:
  - uploaded,
  - queued,
  - processing,
  - extracted,
  - needs review,
  - reviewed.

### 4.3 Results

Purpose:

- Global line-item table for searching, editing, confirmation, and export.

Filters:

- Batch.
- Document.
- Month.
- Status.
- Risk.
- Conflict.
- Product code.
- Product name.

Table columns:

- Row number.
- Batch.
- Image/document.
- Month.
- Product code.
- Product name.
- Unit.
- Quantity.
- Unit price.
- Amount.
- Risk.
- Status.
- Conflict reason.
- Updated time.
- Actions.

Interactions:

- Inline edit cells.
- Confirm/unconfirm.
- Exclude row.
- Open document in review.
- Bulk confirm low-risk filtered rows.
- Export filtered/all.

Density:

- Compact table.
- Sticky header.
- Server-side pagination.
- Optional column visibility.

### 4.4 Review Workbench

Purpose:

- Fast source-image comparison and row correction.

Layout:

```text
+-------------------------------------------------------------+
| Review toolbar: queue filter, prev/next, confirm document    |
+------------------------------+------------------------------+
|                              | Document rows and warnings    |
| Source image viewer          | Editable row grid             |
| zoom / pan / fit             | Attempt comparison drawer     |
|                              |                              |
+------------------------------+------------------------------+
| Thumbnail/document queue strip                              |
+-------------------------------------------------------------+
```

Image viewer:

- Fit.
- Zoom in.
- Zoom out.
- Reset.
- Pan.
- Open original.
- Missing image state.

Rows:

- Editable fields.
- Field warning indicators.
- Row risk badge.
- Confirm row.
- Exclude row.
- Add missing row.

Attempt comparison:

- Show provider/model and attempt status.
- Highlight disagreements:
  - date,
  - row count,
  - product code/name/unit,
  - qty/price/amount.

Navigation:

- Previous document.
- Next document.
- Next needing review.
- Thumbnail list with status/risk color.

### 4.5 Products

Purpose:

- Curate product library.

Toolbar:

- Search.
- Conflict-only toggle.
- Rebuild observations.
- Export.

Table columns:

- Code.
- Name.
- Unit.
- Aliases.
- Observation count.
- Source documents.
- Multi-code note.
- Multi-unit note.
- Conflict status.
- Last seen.
- Actions.

Interactions:

- Edit product.
- View observations.
- View source rows.
- Resolve conflict.
- Apply product changes to matching rows only after explicit confirmation.

### 4.6 Conflicts

Purpose:

- Dedicated triage list for library/data quality problems.

Filters:

- Conflict type.
- Severity.
- Status.
- Batch/month.

Table:

- Conflict type.
- Reason.
- Product.
- Source count.
- Severity.
- Status.
- Actions.

Detail panel:

- Source rows.
- Source documents.
- Recommended resolution.
- Resolve/ignore actions.

### 4.7 Import

Purpose:

- Bring v5 JSON/image data into the rebuilt app.

Flow:

1. Select files:
   - recognition results JSON,
   - image library JSON,
   - product library JSON,
   - image folder/manifest if available.
2. Preview counts and warnings.
3. Choose import options.
4. Run import.
5. Open created migration batch.

Warnings:

- Missing images.
- Duplicate rows.
- Unknown fields.
- Invalid JSON.

### 4.8 Settings

Sections:

- Recognition strategy.
- Providers.
- Queue.
- Validation rules.
- Export.
- Backup.
- About/data paths.

Provider settings:

- Provider enabled.
- Provider protocol: OpenAI Responses or Anthropic Messages.
- Base URL.
- Model.
- API key input, never echoed after save.
- Priority.
- Test connection.
- Last success/failure.

Queue settings:

- Concurrency.
- Max attempts.
- Backoff.
- Rate limit.

Validation settings:

- Invalid name dictionary.
- Product code cleaning rule.
- Amount tolerance.
- Default review thresholds.

## 5. Visual Design Tokens

Use CSS variables through Tailwind/shadcn style conventions.

Color roles:

- `background`: near-white app background.
- `foreground`: dark neutral text.
- `muted`: low-emphasis surfaces.
- `muted-foreground`: secondary text.
- `border`: subtle neutral border.
- `primary`: restrained blue for primary actions.
- `primary-foreground`: white.
- `success`: green for confirmed/healthy.
- `warning`: amber for pending/risk.
- `danger`: red for failure/conflict.
- `info`: cyan/blue for processing.

Recommended palette intent:

- Neutral base: cool gray, not dark navy-dominant.
- Primary: clear operational blue.
- Status colors: green/amber/red/cyan used sparingly.
- No purple/pink gradient theme.
- No beige/brown dominant theme.

Typography:

- Use a professional Chinese-capable sans-serif stack.
- Prefer `Inter`, `Noto Sans SC`, system sans fallback.
- Body: 13-14px.
- Dense table: 12-13px.
- Page title: 18-22px.
- No viewport-width font scaling.
- Letter spacing: 0.

Radii:

- Cards/panels/tables: 6-8px.
- Buttons: 6px.
- Badges: pill allowed for short status labels.

Spacing:

- App shell uses 16px page padding.
- Dense toolbar gap 8px.
- Table cell vertical padding 6-8px.

## 6. Components

Core shadcn components:

- Button.
- Input.
- Select.
- Checkbox.
- Tabs where local tabbing is needed.
- Dialog.
- Sheet.
- Dropdown menu.
- Table.
- Badge.
- Progress.
- Tooltip.
- Separator.
- Sidebar.
- Resizable panels for review layout.

Lucide icon candidates:

- Upload.
- FileImage.
- Table.
- Search.
- Filter.
- Save.
- Download.
- RefreshCw.
- RotateCcw.
- Check.
- X.
- AlertTriangle.
- CircleAlert.
- Clock.
- Play.
- Pause.
- Square.
- Eye.
- ZoomIn.
- ZoomOut.
- Maximize.
- Database.
- Settings.
- History.
- GitCompare.

## 7. Interaction Principles

Status visibility:

- Every background process must have visible status.
- Failed items need clear retry actions.

Review efficiency:

- The primary keyboard/mouse path is "inspect warning -> edit -> confirm -> next".
- Do not force users to return to a table after each document.

Data safety:

- Destructive actions use confirmation.
- Deletes are soft/exclude by default.
- Bulk confirm requires a filter summary and a clear count.

Traceability:

- Every row can open its source document.
- Every conflict can reveal its source rows.
- Every product can show observations.

Cost awareness:

- Strategy and provider should be visible at batch level.
- Attempt count and retry count should be visible in document detail.

## 8. Empty, Loading, Error States

Empty states:

- No batches: show create batch/upload action.
- No results: explain that rows appear after recognition/import.
- No review tasks: show all caught up and link to results.
- No products: show rebuild/import action.

Loading:

- Use skeleton rows for tables.
- Use progress bars for batch/job status.

Errors:

- Keep error messages actionable.
- Show provider/job error in document detail.
- Show retry where possible.

No emoji in any state.

## 9. Accessibility

- Buttons must have readable labels or tooltips for icon-only buttons.
- Keyboard focus visible.
- Table actions accessible by keyboard.
- Status badges must not rely only on color.
- Image viewer controls must have text labels or accessible labels.
- Dialog/sheet focus management through shadcn/Radix primitives.

## 10. Responsive Behavior

Desktop-first because the workflow is table/image heavy.

Desktop:

- Sidebar always visible or collapsible to icons.
- Review page uses split panels.

Tablet:

- Sidebar collapses.
- Review image and rows can stack or use tabs.

Mobile:

- Support viewing status and simple review, but not optimize for high-volume editing.
- Tables become horizontally scrollable or compact list views.

## 11. UI Quality Gates

Before preview:

- Search source for emoji Unicode ranges and remove all from UI.
- Ensure no purple/pink gradient theme.
- Verify text does not overflow buttons/badges.
- Verify review split layout has stable dimensions.
- Verify image placeholder, missing image, and failed load states.
- Verify tables handle 7,000+ rows through server pagination/virtualization.

## 12. First Implementation Screens

Frontend-first implementation should start with:

1. App shell/sidebar/topbar.
2. Dashboard with real empty/loading states.
3. Batches page with upload and progress mock wired to API contracts.
4. Results table.
5. Review workbench shell.
6. Product library table.
7. Settings/provider form.

Then connect backend and worker.

## 13. Revision — UI Refine & Config Pass (2026-06-17)

User feedback after live use. These supersede earlier wording where they conflict.

### 13.1 App shell: fixed chrome, scroll only the data region

- The shell occupies exactly the viewport height (`h-screen`, `overflow-hidden` at the root).
- Left sidebar is fixed (does not scroll away with content) and has its own internal scroll if nav grows.
- The right column splits into a fixed top header (batch switch, search, queue status, upload) and a scrollable content area below it.
- Only the content area scrolls. Long tables/lists scroll inside the content region; the sidebar and header stay put.
- Tables keep their sticky header so column titles remain visible while scrolling rows.

### 13.2 Inline editing (replaces edit drawer/dialog)

- Both the review workbench detail table and the全部结果 table support click-to-edit on the cell.
- Editable fields: 产品编码 / 产品名称 / 单位 / 数量 / 单价 / 金额. Click a cell → inline input; Enter or blur commits via `PATCH /api/rows/:id`; Esc cancels.
- After commit, the row re-validates risk on the backend and the view refreshes; no modal.
- The popup `EditRowDrawer` form is removed from the results flow (kept only as a fallback component, not wired).
- Inline editing is implemented once as a shared cell component reused by both pages.

### 13.3 Review document selector: visual, filterable, paginated

- The bottom thumbnail strip is replaced with a compact document list that scales to hundreds of files per batch.
- Each item shows file name + a status badge (待复核 / 部分确认 / 已确认 / 冲突) derived from its rows, plus risk.
- Status filter chips (全部 / 待复核 / 已确认 / 冲突) and a name search narrow the list so reviewers can see at a glance what is done vs. pending.
- The list paginates client-side (page through, fixed page size) and scrolls within a fixed-height panel.

### 13.4 Pagination on all large lists

- 全部结果 already server-paginated; extend the same pattern to 批次管理 / 产品库 / 冲突管理 (server-side `page`/`pageSize`, search/status pushed to the API).
- Keep it simple — page-number + prev/next footer matching the results table; no infinite scroll, no virtualization unless needed. (Avoid over-engineering.)

### 13.5 Configurable recognition: prompts + dual-model cross-check

- OCR prompt is configurable. A global default system/user prompt lives in settings; each provider may override its own system/user prompt (empty = inherit global). No hardcoded prompt in code.
- Multi-model "free pairing" lands as **dual-model cross-verification**: the two consensus passes use two different models — pass1 = primary provider, pass2 = secondary provider. Agreement across two different models is the bar for AI auto-approval (reuses the existing consensus logic).
- Primary/secondary models are chosen as a global default in settings and can be overridden per batch. If no secondary is set, the system degrades gracefully to using the primary for both passes.

### 13.6 Import encoding

- v5 JSON import must be encoding-robust: strip a UTF-8 BOM, decode UTF-8 strictly, and fall back to GB18030 for legacy Chinese files so 中文 never renders as mojibake. Uploaded image file names must also display their original Chinese characters intact.

## 14. Audit module — second-pass review of confirmed data (2026-06-17)

Background and design: `output/nice-ocr-audit-module-research.md`. Targets the precision blind spot: rows auto-approved by the machine (`reviewClass = ai_auto`) that no human ever sees.

- **Trigger**: manual "运行审核" button (batch / review workbench). Enqueues an `audit` job per document that has `ai_auto` confirmed rows. No auto/scheduled run in v1 (cost stays transparent).
- **Pipeline (Option C, hybrid)**: Stage 1 rule/statistical pre-filter (re-validate; price outlier vs product-library history; unit mismatch; duplicate row) over all `ai_auto` rows, zero API cost. Stage 2 a third independent AI read of the image cross-checked against the confirmed rows (reused consensus comparison); runs on suspicious documents always, on clean documents at `auditSampleRate`.
- **Row audit state** (`auditState`, badge): `none` 未审核 / `passed` 审核通过(success) / `flagged` 待复审(danger) / `reviewed` 已复审(info). Flagged rows carry `auditNote` (human-readable reasons) and optional `auditSuggestionJson` (AI suggested values).
- **Disposition**: AI never rewrites confirmed data — it only flags + suggests. Flagged rows form a **复审队列** surfaced via the 全部结果 `审核=待复审` filter and the review workbench (audit badge + "采纳" to apply the AI suggestion). Any human confirm/edit on a flagged row transitions it to `reviewed` (leaves the queue).
- **Dashboard**: a "待复审" tile (flaggedRows) + "前往复审" link to `/results?audit=flagged`.
- **Settings**: 审核模型 (audit provider, prefer one different from the primary for an independent lens) + 干净行抽样率 (auditSampleRate 0~1).
- Non-goals: no full-AI re-audit, no auto-rewrite, no scheduled run, no cascade relations.

## 15. Revision — Shell header cohesion (2026-06-18)

修复反馈：「每个页面顶部都有 search / 业务有割裂感」。根因：顶栏的**全局产品搜索**（永远跳 `/results`，与当前页业务无关）+ **批次切换下拉**出现在每个页面，而每个页面体内又有自己的上下文搜索/筛选 → 顶部双重搜索冗余 + 顶栏控件与页面业务各自为政。

修订后顶栏（app-shell header）= **统一应用 chrome，不再承载与页面冲突的业务搜索**：
- **移除**顶栏全局产品搜索（搜索回归各页自己的上下文：批次搜批次、产品搜产品、结果搜结果、审核搜文档）。
- **移除**顶栏「切换批次」下拉（与左侧「批次管理」导航 + 页面内上下文重复；切换批次走 `/batches`）。
- 顶栏左侧改为**上下文面包屑**：`分区 · 当前页`（由路由匹配侧栏 navGroups 推导，如「工作区 · 审核工作台」），反映「我在哪」，是导航 chrome 而非内容标题。
- 顶栏右侧保留真正的全局项：**队列状态**指示 + **上传图片** 主 CTA。
- 各页保留自身 `h1` 标题 + 上下文搜索/筛选；面包屑（chrome）与 `h1`（内容）分层不冲突。
- 约束不变：图标仅用 lucide、颜色取 token、无 emoji、无紫粉渐变。

## 16. Revision — 交互体验修复（2026-06-18）

修复反馈：批次点击不进预览、审核台布局拥挤（文件检查/搜索）、图片不可拖拽、侧边栏不能折叠、缺 README。

- **批次列表整行可点击**：[batches-page.tsx](../nice-ocr/src/components/batches/batches-page.tsx) 的 `<tr>` 整行 `cursor-pointer` + `router.push(/batches/[id])` 进入详情（预览）；行尾加 `ChevronRight` 提示可进入；「上传」按钮 `stopPropagation` 不触发跳转。
- **侧边栏可折叠**：[app-shell.tsx](../nice-ocr/src/components/app-shell/app-shell.tsx) 顶栏加折叠按钮（`PanelLeftClose`/`PanelLeftOpen`）。展开 `w-60`、折叠 `w-16` 仅留居中图标（label/分组标题隐藏，hover title 提示）；状态存 `localStorage`，`transition-[width]` 平滑。
- **审核台三栏重构**：[review-page.tsx](../nice-ocr/src/components/review/review-page.tsx) 由「原图(含挤压的文件搜索) | 明细」两栏改为 **`文件列表(230px) | 原图预览 | 识别明细(更宽)`** 三栏。文件检查/搜索/过滤/分页独立成左列、可滚动；原图与明细各占独立列，互不挤压。
- **原图可缩放 + 拖拽平移**：新增 [image-viewer.tsx](../nice-ocr/src/components/ui/image-viewer.tsx)（缩放按钮 + Ctrl+滚轮缩放 + 放大后按住拖拽平移，grab/grabbing 光标）。审核台原图改用该组件。
- **README**：重写 [nice-ocr/README.md](../nice-ocr/README.md)，去除 create-next-app 样板，补全环境要求、快速开始、worker 启动、AI provider 配置、脚本表、路由、目录结构、测试与端口释放说明。
- 约束不变：图标仅用 lucide、颜色取 token、无 emoji、无紫粉渐变。

## 17. Revision — 审核「专注模式」（2026-06-18）

反馈：审核台内容太杂、不专注，希望一个专注模式只保留高价值内容、排版人性化、一页快速管理。

- **专注模式开关**：审核台头部加「专注模式」(`Maximize2`)；进入后头部替换为**精简控制条**：`退出专注 ǀ 文件名 ǀ 进度 N/总 ǀ 风险badge（点开风险说明）  ……  上一张 ǀ 快速跳转下拉 ǀ 下一张 ǀ 运行审核 ǀ 确认本单`。
- **只留高价值内容**：专注模式布局从三栏收敛为**两栏 `原图预览 ǀ 识别明细`**，撑满视口高度（`min-h-[calc(100vh-9rem)]`）；隐藏「文件列表」「识别尝试」「风险详情」三块次要面板（风险通过控制条 badge + 风险说明抽屉随时可达）。识别明细表在专注模式下 `flex-1` 填满，可滚动审更多行。
- **快速切换（一页管完）**：控制条内「快速跳转」原生下拉可直达任意文件；上一张/下一张按钮；**键盘 ←/→ 切换单据、Esc 退出**（在输入框/下拉内不拦截编辑，仅 Esc 生效）。
- 退出专注回到三栏常规视图。普通/专注两套布局同源数据，切换不丢编辑上下文。
- 约束不变：图标仅用 lucide、颜色取 token、无 emoji、无紫粉渐变。

## 18. Fix — 状态徽章换行截断（2026-06-18）

反馈：列表内状态徽章样式异常、没有完全展开。根因：[badge.tsx](../nice-ocr/src/components/ui/badge.tsx) 的 `Badge` 为固定高度 `h-6` 但缺少 `whitespace-nowrap`，在较窄列里较长中文标签（如「AI自动通过」「待人工复核」「混合(AI+人工)」）在圆角药丸内换行、被固定高度截断。

修复：Badge 基础类加 `whitespace-nowrap shrink-0 leading-none`，药丸随文字横向撑开、永不换行，flex 容器内不被压缩。一处修复，所有状态徽章（批次/结果/审核/复审/审批模式）统一生效。验证：结果页 201 个徽章全部 `nowrap`、单行 24px、无截断。
