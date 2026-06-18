# nice-ocr Architecture

> Super Dev core document 2/3  
> Status: draft for confirmation  
> Date: 2026-06-16

## 1. Architecture Decision

Rebuild as a Next.js full-stack TypeScript application with local-first SQLite persistence and a background worker.

Initial stack:

- Framework: Next.js App Router.
- Language: TypeScript.
- UI: React, shadcn/ui, Tailwind, Lucide icons.
- Server state: TanStack Query.
- Tables: TanStack Table, with server-side pagination; TanStack Virtual where necessary.
- Database: SQLite via Prisma ORM.
- File storage: local filesystem under managed `storage/`.
- Queue: database-backed queue table + Node worker loop for v1.
- AI: database-configured provider abstraction, supporting OpenAI Responses and Anthropic Messages protocols through official SDKs.
- Export: Excel generation server-side.

Future-ready:

- SQLite can migrate to PostgreSQL.
- DB queue boundary can migrate to BullMQ/Redis.
- Provider abstraction can add Azure Document Intelligence, Google Document AI, AWS Textract, or other LLM providers.
- Model endpoint, API key, protocol, default model, priority, and enabled state are runtime configuration data stored in the database, not `.env`.

## 2. Why SQLite First

SQLite is appropriate for the first rebuild because this is currently a local/small-team tool and needs a simple durable database more urgently than a distributed deployment. WAL mode improves read/write coexistence, while SQLite's single-writer constraint is acceptable if worker writes are short and controlled.

Important constraints:

- Use WAL mode.
- Keep transactions short.
- Add indices for table filters.
- Avoid writing huge raw image data into DB.
- Use file paths for source images and raw attempt JSON.
- Keep schema compatible with PostgreSQL concepts.

## 3. Runtime Topology

Local v1:

```text
Browser
  |
  | HTTP / Server Actions
  v
Next.js App
  |
  | Prisma
  v
SQLite database
  |
  | file paths
  v
Managed storage/

Background Worker
  |
  | polls DB queue / claims jobs
  v
AI Provider(s)
```

Process options:

- Development: Next dev server plus a worker command.
- Simple production/local: one Node process can start Next and a worker module, or two commands can be run separately.
- Future production: web process + worker process + Redis/BullMQ + PostgreSQL.

## 4. Directory Plan

```text
app/
  (app)/
    layout.tsx
    page.tsx                         # dashboard / batch monitor
    batches/
      page.tsx
      [batchId]/page.tsx
    results/page.tsx
    review/page.tsx
    products/page.tsx
    conflicts/page.tsx
    settings/page.tsx
    import/page.tsx
  api/
    batches/route.ts
    batches/[id]/route.ts
    documents/[id]/route.ts
    documents/[id]/image/route.ts
    documents/[id]/retry/route.ts
    rows/route.ts
    rows/[id]/route.ts
    rows/bulk-confirm/route.ts
    products/route.ts
    products/rebuild/route.ts
    products/[id]/route.ts
    conflicts/route.ts
    exports/recognition/route.ts
    exports/products/route.ts
    import/v5/route.ts
components/
  app-shell/
  batches/
  upload/
  results/
  review/
  products/
  settings/
  ui/
lib/
  db/
  files/
  queue/
  recognition/
  validation/
  products/
  export/
  import/
  audit/
  env.ts
prisma/
  schema.prisma
  migrations/
scripts/
  worker.ts
storage/
  originals/
  thumbnails/
  attempts/
  exports/
  backups/
```

## 5. Data Model

### Batch

- `id`
- `name`
- `notes`
- `status`
- `strategy`
- `createdAt`
- `updatedAt`
- `documentCount`
- `rowCount`
- `failedCount`
- `needsReviewCount`

### Document

- `id`
- `batchId`
- `originalName`
- `storedPath`
- `thumbnailPath`
- `hash`
- `mimeType`
- `sizeBytes`
- `width`
- `height`
- `status`
- `reviewStatus`
- `tag`
- `rowCount`
- `riskLevel`
- `riskReasonsJson`
- `createdAt`
- `updatedAt`

### RecognitionJob

- `id`
- `batchId`
- `documentId`
- `type` (`extract`, `second_pass`, `consensus`, `import`)
- `status`
- `priority`
- `attemptsMade`
- `maxAttempts`
- `nextRunAt`
- `lockedAt`
- `lockedBy`
- `lastError`
- `createdAt`
- `updatedAt`

### ExtractionAttempt

- `id`
- `documentId`
- `jobId`
- `providerKey`
- `model`
- `promptVersion`
- `schemaVersion`
- `strategy`
- `status`
- `rawOutputPath`
- `parsedJson`
- `validationJson`
- `tokenUsageJson`
- `costEstimate`
- `latencyMs`
- `startedAt`
- `completedAt`
- `error`

### RecognitionRow

- `id`
- `batchId`
- `documentId`
- `canonicalAttemptId`
- `rowIndex`
- `rawDate`
- `normalizedMonth`
- `code`
- `name`
- `unit`
- `qty`
- `price`
- `amount`
- `remark`
- `extraJson`（场景声明的非核心字段键值对，默认 `{}`；见第 16 节）
- `status`
- `riskLevel`
- `riskReasonsJson`
- `conflictState`
- `deletedAt`
- `createdAt`
- `updatedAt`

### ProductObservation

- `id`
- `rowId`
- `batchId`
- `documentId`
- `rawCode`
- `cleanCode`
- `name`
- `unit`
- `qty`
- `normalizedMonth`
- `createdAt`

### Product

- `id`
- `code`
- `name`
- `unit`
- `aliasesJson`
- `status`
- `remark`
- `firstSeenAt`
- `lastSeenAt`
- `createdAt`
- `updatedAt`

### ProductConflict

- `id`
- `productId`
- `type`
- `severity`
- `reason`
- `sourceRowIdsJson`
- `status`
- `resolutionNote`
- `createdAt`
- `resolvedAt`

### AuditLog

- `id`
- `entityType`
- `entityId`
- `action`
- `beforeJson`
- `afterJson`
- `actor`
- `createdAt`

### AppSetting

- `key`
- `valueJson`
- `updatedAt`

### AiProviderConfig

- `id`
- `providerKey`
- `displayName`
- `protocol` (`openai_responses`, `anthropic_messages`)
- `baseUrl`
- `apiKey`
- `model`
- `enabled`
- `priority`
- `temperature`
- `maxOutputTokens`
- `metadataJson`
- `createdAt`
- `updatedAt`

Runtime rule:

- `.env` only carries infrastructure values such as `DATABASE_URL` and `STORAGE_DIR`.
- AI keys and model routing are configured in `AiProviderConfig`.
- The worker resolves the active provider from the database for each job.
- `openai_responses` uses the official `openai` SDK and `client.responses.parse`.
- `anthropic_messages` uses the official `@anthropic-ai/sdk` and `client.messages.create`.
- Both adapters use structured output schemas; no provider request body is manually constructed with raw `fetch`.

### ExportRecord

- `id`
- `type`
- `filterJson`
- `filePath`
- `rowCount`
- `createdAt`

## 6. API Contract Draft

All APIs return JSON unless exporting a file.

### Batch APIs

`GET /api/batches`

- Query: `status`, `q`, `page`, `pageSize`
- Returns paginated batch list.

`POST /api/batches`

- Body: `{ name, notes?, strategy? }`
- Creates batch.

`POST /api/batches/:id/upload`

- Multipart form with `files[]`.
- Stores files, creates documents, enqueues jobs.
- Returns `{ batch, documents, queuedJobs }`.

`GET /api/batches/:id`

- Returns batch details and progress.

`POST /api/batches/:id/pause`

- Pauses queued processing for the batch.

`POST /api/batches/:id/resume`

- Resumes queued processing.

### Document APIs

`GET /api/documents/:id`

- Returns document metadata, rows, attempts, conflicts.

`GET /api/documents/:id/image`

- Streams source image or thumbnail.

`POST /api/documents/:id/retry`

- Body: `{ providerKey?, strategy? }`
- Enqueues retry/second pass.

### Row APIs

`GET /api/rows`

- Query: `batchId`, `documentId`, `month`, `status`, `risk`, `conflict`, `code`, `name`, `page`, `pageSize`, `sort`
- Returns paginated rows.

`PATCH /api/rows/:id`

- Body: editable row fields.
- Updates row, revalidates, writes audit log.

`POST /api/rows/:id/confirm`

- Confirms row.

`POST /api/rows/:id/unconfirm`

- Moves row back to pending/needs review.

`DELETE /api/rows/:id`

- Soft-excludes row.

`POST /api/rows/bulk-confirm`

- Body: filter snapshot and guard such as `onlyLowRisk: true`.

### Product APIs

`GET /api/products`

- Query: `q`, `conflict`, `page`, `pageSize`.

`POST /api/products/rebuild`

- Body: `{ batchId?, includePending?: boolean }`.
- Rebuilds observations/conflicts.

`PATCH /api/products/:id`

- Updates curated product fields.

`GET /api/conflicts`

- Query: `status`, `type`, `severity`.

`POST /api/conflicts/:id/resolve`

- Body: `{ resolutionNote }`.

### Export APIs

`POST /api/exports/recognition`

- Body: row filter snapshot.
- Returns Excel.

`POST /api/exports/products`

- Body: product filter snapshot.
- Returns Excel.

### Import APIs

`POST /api/import/v5/preview`

- Multipart JSON files and optional image directory manifest.
- Returns counts and validation warnings.

`POST /api/import/v5`

- Performs import into a migration batch.

## 7. Recognition Pipeline

### 7.1 Job Lifecycle

```text
uploaded -> queued -> active -> completed
                         |
                         v
                     retrying -> failed
```

Worker behavior:

1. Claim due queued job with transaction.
2. Load document and strategy settings.
3. Select provider(s).
4. Call provider.
5. Save raw output and extraction attempt.
6. Parse/validate structured result.
7. Create/update canonical rows.
8. Compute risk and review state.
9. If balanced strategy and high risk, enqueue second-pass job.
10. Mark job completed or retry/failed.

### 7.2 Provider Interface

```ts
type RecognitionProvider = {
  key: string
  displayName: string
  supportsImageInput: boolean
  supportsStructuredOutput: boolean
  recognize(input: RecognitionInput): Promise<ProviderExtractionResult>
}
```

Normalized result:

```ts
type ProviderExtractionResult = {
  rawDate: string
  normalizedMonth?: string
  rows: Array<{
    code: string
    name: string
    unit: string
    qty: number
    price: number
    amount: number
    remark?: string
    confidence?: number
  }>
  providerMeta: {
    model: string
    latencyMs: number
    tokenUsage?: unknown
    costEstimate?: number
  }
}
```

### 7.3 Strategy Semantics

Fast:

- One provider, one attempt.
- Review routing from validation/risk only.

Balanced:

- Primary provider first.
- If document/row risk crosses threshold, enqueue second pass.
- Compare attempts; agreement lowers risk, disagreement raises review priority.

Consensus:

- Run two or more providers/models for every document.
- Canonical rows are chosen only after merge/compare.
- Disagreements become review tasks.

Manual:

- No AI job created.
- User can manually enter rows or import rows.

## 8. Validation and Risk

Validation modules:

- Date normalization.
- Numeric parsing.
- Arithmetic check.
- Invalid product-name dictionary.
- Product code cleaning rule.
- Product conflict detector.
- Attempt disagreement detector.

Risk levels:

- `low`
- `medium`
- `high`

Example risk reasons:

- `DATE_PARSE_FAILED`
- `INVALID_PRODUCT_NAME`
- `AMOUNT_MISMATCH`
- `CODE_CLEANED_BY_RULE`
- `CODE_NAME_CONFLICT`
- `NAME_MULTI_CODE`
- `NAME_MULTI_UNIT`
- `PROVIDER_DISAGREEMENT`
- `EXTRACTION_SCHEMA_ERROR`

## 9. Product Library Architecture

Separate derived observations from curated master data.

Recognition rows produce `ProductObservation` records.

Rebuild process:

1. Select rows, default confirmed rows only.
2. Normalize product code/name/unit.
3. Upsert observations.
4. Upsert or suggest curated products.
5. Detect conflicts.
6. Keep source row links.

Do not silently mutate recognition rows when editing a curated product. Instead:

- Offer explicit "apply to matching rows" action.
- Record audit logs.
- Re-run validation/conflict detection after applying.

## 10. File Storage

Managed storage:

- `storage/originals/<batchId>/<documentId>.<ext>`
- `storage/thumbnails/<documentId>.webp`
- `storage/attempts/<documentId>/<attemptId>.json`
- `storage/exports/<exportId>.xlsx`
- `storage/backups/<timestamp>/...`

Rules:

- Keep source images by default.
- Store raw provider outputs outside DB as files with DB references.
- During import, copy legacy images into managed storage where possible.

## 11. Migration From v5 JSON

Import mapping:

- `recognition-results.json` -> `Batch`, `Document`, `RecognitionRow`, optionally `ProductObservation`.
- `image-library.json` -> `Document` metadata, image status/tag.
- `product-library.json` -> `Product` and `ProductConflict` where applicable.
- `uploads/` and `uploads/library/` -> managed `storage/originals`.

Migration safeguards:

- Preview counts before import.
- Preserve original JSON backup.
- Add `legacyId`/`legacySourceJson` references where useful.
- Do not drop rows with missing images; mark document `missing_source`.

## 12. Security and Privacy

Initial local-first assumptions:

- API keys must be stored in the configuration database and never in client bundles; the settings API returns only `hasApiKey`.
- `.env` is reserved for infrastructure values such as database and storage paths, not model/provider routing.
- Source images may contain business-sensitive information; keep storage local unless user configures cloud.
- Do not log raw image base64 or full provider raw output in console.
- Redact API keys in settings UI.
- Use same-origin APIs.

Future:

- Add user login and role-based actions before network/shared deployment.
- Add backup encryption option.

## 13. Testing Strategy

Unit tests:

- Date normalization.
- Product code cleaning.
- Invalid name detection.
- Arithmetic validation.
- Product conflict detection.
- Attempt merge/disagreement detection.

Integration tests:

- v5 JSON import.
- Upload -> job -> attempt -> rows.
- Retry failed job.
- Row edit revalidates conflicts.
- Product rebuild.
- Export generation.

Runtime smoke:

- App loads.
- Upload fixture image or mock provider result.
- Worker processes job.
- Review page opens image and rows.
- Export downloads.

## 14. Architecture Risks

SQLite write contention:

- Mitigate with short transactions, WAL, worker concurrency defaults, and later PostgreSQL option.

Local worker lifecycle:

- Need clear dev/prod command and visible "worker offline" state in UI.

Provider costs:

- Balanced mode default; store cost estimates and per-batch attempt counts.

LLM output instability:

- Use structured outputs where provider supports it; validate all results; save raw output; retry or route to review on schema failure.

Product master semantics:

- Keep observations and curated products separate to avoid hidden data mutation.

## 15. Coding Gate Notes

Before implementation, Super Dev requires:

- Read actual package versions after scaffolding.
- Check official Next.js/Prisma/shadcn/TanStack/AI SDK docs for exact APIs.
- Declare UI icon library: Lucide.
- Confirm design tokens from `output/nice-ocr-uiux.md`.
- Establish page shell and shared types before business code.

## 16. Field Schema Generalization & Export Templates

> 由 change `field-schema-templates` 引入。把识别字段从写死的「副食品」场景解耦为单一事实源，统一驱动识别/入库/表格/导出。

### 16.1 field-schema 单一事实源
- `src/lib/fields/field-schema.ts`：`FieldDef { key, label, type, core, editable, recognitionHint?, numFmt?, width?, align? }` + `FieldScenario { id, name, description, fieldKeys[] }`。
- `core: true` 的字段映射 RecognitionRow 真实列；`core: false` 存入 `RecognitionRow.extraJson`（`{ [key]: value }`）。
- 内置字段目录 + 内置场景 `grocery`（= 现有核心字段）；活动场景 id 存 `AppSetting.fields.activeScenario`（缺省 grocery）。新增场景/字段 = 扩展注册表（在线字段构建器为后续迭代）。
- 只读元字段（batch/document/normalizedMonth/status/risk）单列定义，供表格与导出引用，不参与识别。

### 16.2 识别链路（已就绪扩展点，当前未激活）
- 现状：实时识别 worker 尚未接通落库（识别行目前仅由 v5 导入产生），且仅有 grocery 一个场景，其字段正好 = v5 模板识别列，故「抽取字段 ↔ 模板」当前已成立，识别提示词/结构化 schema 暂保持 grocery 形态。
- 扩展点（新增第二个场景/模板时再接通）：基于 field-schema 的活动场景字段动态生成结构化输出 schema 与提示词，`normalizeExtraction` 把结果拆为 {核心列} + {extraJson}。
- 数据侧已就绪：`RecognitionRow.extraJson` 已落库；Row PATCH API 已支持 `extra` 合并写入；结果表/审核台已按 field-schema 动态出列（核心列 + extraJson 列）。

### 16.3 导出模板
- `src/lib/workflows/export-templates.ts`：`ExportTemplate { id, name, description, sheetName, filename, resolveColumns() }` 注册表（系统就绪，可随时追加模板）。
- **当前仅内置一个模板 `v5-20260618`（默认）= 原始 v5 导出的精确复刻**：14 列 `图片名/图片标签/原始日期/归一化月份/商品编码/商品名/单位/数量/单价/金额/状态/备注/资料库冲突/冲突原因`，列名/顺序/列宽/数字格式与 `docs/v5_new_3 2` 的 `/api/export` 完全一致（状态英文枚举导出时映射回中文；资料库冲突取 `conflictState`，冲突原因取 `riskReasonsJson`）。承载「当前流程」。
- 不预置其它模板；后续需要新模板时在注册表加一项即可（`resolveColumns` 可基于 field-schema 场景字段动态出列，单测 `export-templates.test.ts` 锁定 v5 列契约）。
- 共享样式引擎对齐 v5：深色表头 `FF2D3748` + 白色加粗居中、按 `FieldDef.numFmt` 设数字格式、CJK 感知自适应列宽、冻结首行。
- 取值优先级：元字段/派生（图片名/标签/状态/冲突…）→ 核心列 → `extraJson[key]`。
- 「识别抽取字段 ↔ 模板」：导出模板与识别共用同一份 field-schema 场景字段（当前 grocery 场景字段 = v5 模板识别列），二者天然对应。

### 16.4 导出 API（追加第 6 节 Export APIs）
- `POST /api/exports/recognition` body `{ templateId }`（缺省 `standard`）。
- `GET /api/exports/templates` 返回模板列表 `{ id, name, description }[]` 供前端模板选择。

### 16.5 编辑抖动修复（前端）
- 可编辑单元格改常驻输入框（本地状态 + onBlur/Enter + 防抖），消除展示/编辑两态 DOM 切换的布局位移。
- 提交走乐观更新（`setQueryData` 就地改行），不再全表 `invalidate` 重拉；rows 排序改稳定键（`rowIndex`/`createdAt asc`），编辑不再跳行。

## 17. 上传格式：图片 / PDF / ZIP（2026-06-18）

上传不再限于图片。`src/lib/files/ingest.ts` `ingestUpload(name, buffer, mimeType)` 把每个上传文件**统一展开为图片列表**，下游（存储 / Document / 识别 / 预览）一律按图片处理、零改动：
- **图片**：原样透传（按扩展名/ mime 推断类型）。
- **PDF**：用 `pdf-to-img`（内部 `pdfjs-dist` + `@napi-rs/canvas` 预编译二进制）按 `scale: 2` **逐页渲染为 PNG**，每页一个 Document（命名 `<原名>-p<页号>.png`）。显式配置 `standardFontDataUrl` + `cMapUrl`（正斜杠 + 尾随 `/` 的 fs 路径，Node 字体工厂用 `fs.readFile` 读），保证标准字体与 CJK 文字正确渲染。
- **ZIP**：用 `fflate` `unzipSync` 解压，对其中图片直接收录、PDF 逐页渲染，忽略目录 / 隐藏项 / `__MACOSX` / 其它格式。
- 上传路由 [batches/[id]/upload](../nice-ocr/src/app/api/batches/[id]/upload/route.ts) 先 ingest 再逐图 `storeOriginal` + 建 Document + 入队；无可识别内容返回 400 友好提示。`maxDuration = 300` 容纳 PDF 渲染耗时。
- 依赖：`fflate`、`pdf-to-img`、`pdfjs-dist`（直接依赖，便于解析字体/CMap 目录）。`@napi-rs/canvas`/`pdf-to-img`/`pdfjs-dist` 在 `next.config.ts` 的 `serverExternalPackages` 中外置，避免打包原生模块。
- 前端：批次列表与批次详情的上传 `accept` 扩展为 `image/*,application/pdf,.pdf,.zip,application/zip`，并提示「支持 图片 / PDF / ZIP」+ 失败错误回显。
