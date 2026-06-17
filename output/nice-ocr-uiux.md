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
