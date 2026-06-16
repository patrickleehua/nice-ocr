# nice-ocr Research

> Super Dev phase: research  
> Date: 2026-06-16  
> Scope: only the current `docs/v5_new_3 2` business, then plan a commercial-grade Next full-stack rebuild.

## 1. Executive Summary

The current v5 system has already proven the business loop:

1. Upload receipt/order/table images.
2. Use a vision-capable LLM to extract date and line items.
3. Let a user edit rows in a global table or review each image side-by-side with the source image.
4. Export recognition results to Excel.
5. Build a "副食品资料库" from recognition rows and surface product-code/name/unit conflicts.

The immature parts are mostly platformization issues, not business invalidity:

- Recognition is synchronous and effectively serial, with no durable job state, retry policy, concurrency control, provider failover, or rate-limit awareness.
- Data persistence is JSON-file overwrite/append-like behavior, with weak idempotency and weak recovery semantics.
- There is no durable batch concept, audit trail, operation history, data versioning, or migration path.
- AI extraction is tied to one OpenAI-compatible endpoint and a free-form JSON prompt. It lacks schema-guaranteed structured output, provider abstraction, confidence/validation policy, cost controls, and targeted re-recognition workflows.
- The UI is usable but not maintainable: large static JS, global mutable state, inline handlers, no typed API contract, no reusable components, emoji icons, and limited workflow visibility.

Recommended rebuild direction:

- Build a Next.js App Router full-stack application with TypeScript.
- Use SQLite first for local durability and simpler deployment, but keep the schema migration-friendly for PostgreSQL later.
- Use durable database tables for batches, documents, OCR attempts, extracted rows, products, conflicts, review actions, exports, and settings.
- Use a job queue abstraction. For the first local version, use a database-backed queue table and worker loop; define a BullMQ-compatible boundary for a later Redis-based production queue.
- Support multiple recognition providers through a provider interface. Initial providers can include OpenAI-compatible vision models and an optional custom/provider slot. The default mode should be cost-aware: single pass plus validation-triggered retry/second opinion, not unconditional repeated recognition.
- Add review routing using risk/confidence/business-rule flags, following mainstream intelligent document processing patterns.
- Rebuild the interface as an operational tool: upload/batch monitor, review workbench, line-item table, product library, conflicts, provider/settings, exports.

## 2. Local System Discovery

### 2.1 Source Area

Current business code lives in:

- `docs/v5_new_3 2/server.js`
- `docs/v5_new_3 2/public/index.html`
- `docs/v5_new_3 2/public/app.js`
- `docs/v5_new_3 2/public/style.css`
- `docs/v5_new_3 2/data/*.json`

Current package:

- Express 4
- Multer
- ExcelJS
- OpenAI SDK
- dotenv

The active data files are currently empty arrays:

- `recognition-results.json`
- `image-library.json`
- `product-library.json`

The README says real historical data may be copied from an older `/v5/data` directory, with "7000多行" recognition results. The rebuild must preserve import/migration from these three JSON files plus image files under `uploads`.

### 2.2 Current User-Facing Modules

Current top-level tabs:

1. `识别结果`
2. `逐图核查`
3. `副食品资料库`

Current `识别结果` page:

- Upload JPG/PNG images by drag/drop or file picker.
- Show upload progress.
- Show stats: total rows, filtered rows, confirmed rows, pending rows, abnormal rows, image count.
- Filter by image, month, status, code, name, conflict-only.
- Edit line item fields inline.
- Confirm/unconfirm a row.
- Delete a row.
- Export filtered or all rows to Excel.
- Save the in-memory row/image state to JSON.

Current `逐图核查` page:

- Left image preview with zoom, fit, original size, drag, wheel zoom.
- Right table of the current image's extracted rows.
- Previous/next image navigation.
- One-click confirm all rows for the current image.
- Thumbnail list with image name search and status filter.

Current `副食品资料库` page:

- Rebuild library from current recognition rows.
- Export product library to Excel.
- Search by product name/code.
- Conflict-only filter.
- Edit product code/name/unit.
- See source images.
- Show conflict reason, multi-code note, multi-unit note.
- Open a conflict source modal and locate a source row in the recognition table.

### 2.3 Current Data Model Inferred From Code

Recognition row fields:

- `id`
- `image_name` / `imageName`
- `image_tag`
- `raw_date`
- `normalized_month`
- `date_parse_error`
- `code`
- `name`
- `unit`
- `qty`
- `price`
- `amount`
- `remark`
- `status`
- `library_conflict`
- `library_conflict_reason`

Image fields:

- `id`
- `name`
- `originalName`
- `storedName`
- `url`
- `status`
- `reviewStatus`
- `tag`
- `missingImage`
- `rowCount`

Product library fields:

- `id`
- `code`
- `name`
- `unit`
- `aliases`
- `sourceImages`
- `sourceRows`
- `count`
- `firstSeenAt`
- `lastSeenAt`
- `conflict`
- `conflictReason`
- `conflictReasons`
- `multiCodeNote`
- `multiUnitNote`
- `remark`

### 2.4 Current Business Rules

Date/month:

- Accepts `YYYY年M月`, `YYYY.M`, `YYYY-M`, `YYYY/M`.
- Normalized month is `YYYY年M月`.

Invalid product names:

- Empty names.
- Numeric/symbol-only values.
- Header/footer/summary words such as 合计、总计、小计、备注、单位、数量、单价、金额、日期、电话、地址、经手人、制单人、采购单、销售单、页码、品名、商品名、编号、编码、规格、客户、供货商、供应商、审核、签字.

Product code cleaning:

- Pure 4-digit or 5-digit code is cleared during product-library rebuild.
- 1-digit or 2-digit code is retained.
- Other lengths are retained.

Conflict semantics:

- Same product code mapped to multiple product names: conflict.
- Invalid product name: conflict/abnormal.
- Product code cleared by 4/5 digit rule: conflict reason.
- Same product name mapped to multiple codes: not conflict, but `multiCodeNote`.
- Same product name mapped to multiple units: not conflict, but `multiUnitNote`.

### 2.5 Current System Risks

Persistence risks:

- Frontend keeps `allRows`, `allImages`, `allLibrary` in memory.
- Save overwrites JSON files as a whole.
- A concurrent browser tab or failed save can lose edits.
- No per-row revision, audit trail, optimistic locking, or idempotent upload key.
- `server.js` contains duplicated route definitions for `/api/state` and `/api/results/save`.

Recognition risks:

- `/api/recognize` loops through uploaded files in a `for...of`, so requests are processed sequentially.
- The frontend also sends one file per request in a loop, further reinforcing serial behavior.
- Uploaded files are deleted after recognition, so the current upload path does not reliably retain source images for later review.
- New image placeholders can have `missingImage: true`.
- No queue, retry, backoff, dead-letter state, cancellation, pause/resume, or per-provider rate limiting.
- No durable attempt record; if a request fails, the user has little operational visibility.
- No schema-enforced structured output.
- No confidence or risk policy.

AI/provider risks:

- One hardcoded OpenAI-compatible base URL and one hardcoded model string.
- No provider health, failover, or cost/latency tracking.
- No differentiation between "fast single pass", "high-risk retry", "full double extraction", and "human-only review".
- No prompt/version management or evaluation set.

Product-library risks:

- The library is rebuilt from rows, but source-of-truth semantics are unclear: is it a derived index, editable master data, or both?
- Editing the product library mutates matching recognition rows heuristically.
- Product resolution does not have durable aliases, merge/split workflows, or review history.

UX risks:

- Dense table is useful but has no batch-level progress model.
- Users cannot easily see what is currently queued, failed, retrying, needing review, or ready to export.
- Inline global JS is difficult to evolve.
- Emoji icons violate Super Dev UI constraints and should be replaced by Lucide/Heroicons/Tabler icons.

## 3. External Research: Mainstream IDP/OCR Patterns

### 3.1 Intelligent Document Processing Pattern

Mainstream document-processing platforms treat OCR as an end-to-end pipeline:

1. Document intake.
2. Classification.
3. Extraction.
4. Validation/rules/master-data matching.
5. Human review for low-confidence or rule-failing data.
6. Export/integration.
7. Continuous improvement from corrections.

Azure Document Intelligence describes the service as extracting text, key-value pairs, tables, and structure, and supports custom extraction models trained from labeled samples. Microsoft docs state custom extraction can start with as few as five examples of the same form/document type. Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/train/custom-model?view=doc-intel-4.0.0

Google Document AI positions the product as transforming unstructured documents into structured data and supporting scalable cloud document-processing applications. Source: https://docs.cloud.google.com/document-ai/docs

ABBYY Vantage describes an IDP platform that extracts structured data from invoices, purchase orders, receipts, contracts, and many other document types, then delivers data through API/connectors. Source: https://docs.abbyy.com/vantage/introduction

Nanonets describes document processing as capture, classification, extraction, validation, and routing into downstream systems. Source: https://nanonets.com/blog/document-processing/

Implication for nice-ocr:

- The rebuild should not be a single "upload -> append rows" action.
- It should model batches, documents, extraction attempts, validation results, review states, and exports explicitly.

### 3.2 Human-in-the-Loop and Confidence Thresholds

Mainstream systems use confidence and validation rules to route uncertain records to humans.

Azure confidence docs explain confidence as statistical certainty/probability of correctness. Source: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0

Google Document AI HITL concepts include field-level confidence thresholds, document-level thresholds, and no-filter modes. If a field is below threshold, the page/document can be sent for review. Source: https://docs.cloud.google.com/document-ai/docs/hitl/concepts

AWS Textract best practices recommend using confidence scores according to the sensitivity of the use case. A low-confidence result may be discarded or flagged. Source: https://docs.aws.amazon.com/textract/latest/dg/textract-best-practices.html

UiPath Document Understanding exposes digitization and extraction confidence in Validation Station and recommends filtering/focusing on low-confidence predictions. Source: https://docs.uipath.com/document-understanding/automation-suite/2023.4/classic-user-guide/training-high-performing-models

ABBYY's HITL material says human review is important when 100% accuracy is required or when documents do not meet validation rules. Source: https://www.abbyy.com/ai-document-processing/human-in-the-loop-verification/

Implication for nice-ocr:

- This system may not get native field confidence from every LLM provider, but it can compute a `riskScore` from:
  - provider-reported confidence when available,
  - schema validation failures,
  - arithmetic mismatch (`qty * price != amount`),
  - invalid name rules,
  - date parse failure,
  - product-library conflict,
  - second-pass disagreement,
  - image quality/document quality warnings if a provider returns them.
- Human review should be routed by `riskLevel`, not only by manual tab browsing.

### 3.3 Batch/Async Processing

Google Document AI supports batch asynchronous requests that return a long-running operation and store results in Cloud Storage. Source: https://docs.cloud.google.com/document-ai/docs/send-request

AWS Textract supports asynchronous operations such as `StartDocumentAnalysis` and `GetDocumentAnalysis`, useful for long-running or large document jobs; completion can be integrated with SNS/SQS. Sources:

- https://docs.aws.amazon.com/textract/latest/dg/async.html
- https://docs.aws.amazon.com/textract/latest/APIReference/API_StartDocumentAnalysis.html
- https://docs.aws.amazon.com/textract/latest/APIReference/API_GetDocumentAnalysis.html

OpenAI Batch API is designed for asynchronous groups of requests with separate rate limits and 24-hour turnaround for non-immediate processing. Source: https://platform.openai.com/docs/guides/batch

BullMQ supports concurrency, retry attempts with backoff, and rate limiting for Node.js workers. Sources:

- https://docs.bullmq.io/guide/workers/concurrency
- https://docs.bullmq.io/guide/retrying-failing-jobs
- https://docs.bullmq.io/guide/rate-limiting

Implication for nice-ocr:

- Use a durable job model even for local-first MVP.
- Expose batch and document status in UI.
- Use configurable concurrency and provider-level rate limits.
- Use retry with exponential backoff for recoverable provider/network errors.
- Use dead-letter/manual retry for unrecoverable schema or unsupported-file errors.

### 3.4 Multi-Provider and Structured Output

OpenAI Structured Outputs provide schema adherence beyond JSON validity and recommend Structured Outputs over JSON mode where possible. Source: https://platform.openai.com/docs/guides/structured-outputs

OpenAI vision docs support image input via `image_url`, including base64 data URLs, with clear input requirements. Source: https://platform.openai.com/docs/guides/images-vision

Vercel AI SDK standardizes LLM integration across providers and supports structured object generation with schemas. It lists multiple providers including OpenAI, Anthropic, Google, Azure, Amazon Bedrock, Groq, Mistral, DeepSeek, and others. Sources:

- https://ai-sdk.dev/docs/introduction
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- https://ai-sdk.dev/docs/foundations/providers-and-models

Implication for nice-ocr:

- Define a provider interface that returns a normalized `ExtractionResult`.
- Store provider, model, prompt version, schema version, token/cost/latency, raw output location, and parsed output.
- Default mode should be "single pass + risk-triggered second pass" to balance cost and accuracy.
- Add "full consensus mode" for high-stakes batches where every document is recognized by multiple providers/models and disagreements are surfaced.
- Keep provider-specific prompts and schemas versioned.

### 3.5 SQLite Suitability

SQLite is a reasonable first durable store for a local/single-user or small-team desktop-like web app.

SQLite WAL mode allows readers and writers to proceed concurrently in many cases: readers do not block writers and a writer does not block readers. Source: https://sqlite.org/wal.html

SQLite supports multiple simultaneous reads but only one simultaneous write transaction. Source: https://sqlite.org/lang_transaction.html

Prisma supports SQLite as a provider, local SQLite files, migrations, and type-safe access. Sources:

- https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite
- https://www.prisma.io/docs/prisma-orm/quickstart/sqlite
- https://www.prisma.io/docs/orm/prisma-migrate

Implication for nice-ocr:

- SQLite is appropriate for the initial rebuild if writes are batched and short.
- Configure WAL and busy timeout.
- Keep worker concurrency reasonable because DB writes serialize.
- Use an ORM/migration layer that can later move to PostgreSQL if multi-user/server deployment grows.
- Avoid storing large images in SQLite; store image files on disk/object storage and metadata in DB.

### 3.6 Frontend/UX Stack

Next.js App Router provides file-based routing, layouts, server/client components, route handlers, and server actions. Sources:

- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/getting-started/route-handlers
- https://nextjs.org/docs/app/getting-started/mutating-data

shadcn/ui's data table guide uses TanStack Table and a base table component for custom sorting/filtering/pagination. Source: https://ui.shadcn.com/docs/components/radix/data-table

shadcn/ui sidebar provides a composable, themeable sidebar foundation. Source: https://ui.shadcn.com/docs/components/radix/sidebar

TanStack Table provides a framework-agnostic table model and TanStack Virtual supports massive scroll surfaces by rendering only visible work. Sources:

- https://tanstack.com/table/latest
- https://tanstack.com/virtual/latest

TanStack Query handles server state, mutations, invalidation, pending/error states, and background reconciliation. Sources:

- https://tanstack.com/query/latest
- https://tanstack.com/query/latest/docs/framework/react/guides/mutations
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation

Implication for nice-ocr:

- UI should use a sidebar-based operational app shell, not a marketing page.
- Use data tables with real server-side pagination/filtering for thousands of rows.
- Use virtualized review tables/lists where useful.
- Use query/mutation state rather than global mutable arrays.
- Use Lucide icons only, no emoji icons.

## 4. User Hypotheses: Validation

User hypothesis 1: "识别没有走多线程并发处理，队列维护，失败重试；数据单一追加有问题；应该用数据库，先 SQLite."

Assessment:

- Correct in substance.
- More precise: recognition should not be called "多线程" first; it needs a durable job queue with bounded concurrency, provider rate limits, retries/backoff, idempotency, cancellation, and job state. Actual parallelism may be worker concurrency, multiple worker processes, or later BullMQ/Redis.
- SQLite is suitable for the first durable local version. It should be used with WAL, short transactions, indices, and a future migration path to PostgreSQL.

User hypothesis 2: "缺少系统化维护，不可长期使用."

Assessment:

- Correct.
- The rebuild should add: schema migrations, settings, logs, audit history, backups/import/export, source image retention, provider registry, prompt/schema versions, QA dashboards, tests, and clear operational states.

User hypothesis 3: "单一依赖一个 AI；应该接一个或多个，模式可选，高风险多次识别还是全部多次识别."

Assessment:

- Correct direction.
- Recommendation: make recognition strategy configurable:
  - `fast`: one provider, one pass.
  - `balanced`: one pass, then second pass only for high-risk docs/rows.
  - `consensus`: all docs get two or more attempts; disagreements require review.
  - `manual-first`: import and hand-enter/repair without AI, useful when providers are unavailable.
- Do not default to "all documents multiple passes" because cost/latency will grow quickly. Use risk-triggered second opinion as the default commercial setting.

Additional issues discovered:

- Uploaded source images are not reliably retained after recognition.
- Duplicate route definitions exist.
- No file hash or duplicate detection.
- No batch model, so users cannot manage a work package.
- No audit trail for edits or product library changes.
- No import migration UI for existing JSON data.
- Product library mixes derived facts and editable master-data semantics.
- No formal API contract or shared types.
- No build/lint/test gate.
- Emoji icons are used in UI, which violates Super Dev constraints.

## 5. Recommended Rebuild Principles

1. Protect the running business loop first.
2. Convert JSON state into normalized durable data.
3. Treat recognition as a background workflow, not a request/response side effect.
4. Keep image files as first-class retained evidence.
5. Make all AI extraction attempts auditable.
6. Use structured schema output and validation.
7. Route review by risk, not by guesswork.
8. Separate derived product observations from curated product master data.
9. Make export reproducible from saved data, not from volatile frontend arrays.
10. Keep v1 local-first, but design for a future PostgreSQL/Redis deployment.

## 6. Sources

- Azure Document Intelligence custom models: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/train/custom-model?view=doc-intel-4.0.0
- Azure confidence scores: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0
- Google Document AI docs: https://docs.cloud.google.com/document-ai/docs
- Google Document AI HITL concepts: https://docs.cloud.google.com/document-ai/docs/hitl/concepts
- Google Document AI request/batch processing: https://docs.cloud.google.com/document-ai/docs/send-request
- AWS Textract async processing: https://docs.aws.amazon.com/textract/latest/dg/async.html
- AWS Textract best practices/confidence: https://docs.aws.amazon.com/textract/latest/dg/textract-best-practices.html
- AWS Textract StartDocumentAnalysis: https://docs.aws.amazon.com/textract/latest/APIReference/API_StartDocumentAnalysis.html
- AWS Textract GetDocumentAnalysis: https://docs.aws.amazon.com/textract/latest/APIReference/API_GetDocumentAnalysis.html
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI Images and Vision: https://platform.openai.com/docs/guides/images-vision
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch
- Vercel AI SDK introduction/providers: https://ai-sdk.dev/docs/introduction
- Vercel AI SDK structured data: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- BullMQ concurrency: https://docs.bullmq.io/guide/workers/concurrency
- BullMQ retries: https://docs.bullmq.io/guide/retrying-failing-jobs
- BullMQ rate limiting: https://docs.bullmq.io/guide/rate-limiting
- SQLite WAL: https://sqlite.org/wal.html
- SQLite transactions: https://sqlite.org/lang_transaction.html
- Prisma SQLite: https://www.prisma.io/docs/orm/core-concepts/supported-databases/sqlite
- Prisma Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- Next.js App Router: https://nextjs.org/docs/app
- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- shadcn/ui data table: https://ui.shadcn.com/docs/components/radix/data-table
- shadcn/ui sidebar: https://ui.shadcn.com/docs/components/radix/sidebar
- TanStack Table: https://tanstack.com/table/latest
- TanStack Virtual: https://tanstack.com/virtual/latest
- TanStack Query: https://tanstack.com/query/latest
- UiPath Document Understanding confidence/validation: https://docs.uipath.com/document-understanding/automation-suite/2023.4/classic-user-guide/training-high-performing-models
- ABBYY Vantage overview: https://docs.abbyy.com/vantage/introduction
- ABBYY HITL: https://www.abbyy.com/ai-document-processing/human-in-the-loop-verification/
- Rossum queue/review API example: https://rossum.app/api/docs/openapi/guides/getting-started/
