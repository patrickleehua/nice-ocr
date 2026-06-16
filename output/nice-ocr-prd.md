# nice-ocr PRD

> Super Dev core document 1/3  
> Status: draft for confirmation  
> Date: 2026-06-16

## 1. Product Vision

nice-ocr is a local-first intelligent document processing tool for副食品单据图片. It converts receipt/order/table images into structured line items, gives business users a fast review workspace, and maintains a durable product library with conflict detection.

The rebuild must preserve the current v5 business loop while making the system reliable enough for long-term daily use.

## 2. Target Users

Primary user:

- A business operator who handles many副食品销售单/采购单 images.
- Needs to turn images into Excel-ready line items.
- Needs to correct AI mistakes quickly by comparing source image and extracted rows.
- Needs to maintain product code/name/unit consistency over time.

Secondary user:

- An administrator/operator who configures AI providers, recognition strategy, retry policy, export templates, and backups.

## 3. Product Goals

### G1. Reliable Batch Recognition

Users can upload many images into a batch, see processing status, retry failures, and continue reviewing while recognition runs in the background.

### G2. Fast Human Review

Users can review by document, row, or risk queue. The review UI must make it clear what needs attention and what can be trusted.

### G3. Durable Data, No Silent Loss

All documents, rows, edits, attempts, conflicts, and exports are stored durably. The app must not rely on a single in-memory array or whole-file JSON overwrite for normal operation.

### G4. Product Library Maintenance

The system should turn recognition rows into product observations, then help the user curate a product library. Conflicts must be explainable and traceable to source documents/rows.

### G5. Configurable AI Strategy

The system supports one or more AI providers and selectable recognition modes:

- Fast single pass.
- Balanced risk-triggered second pass.
- Full consensus mode.
- Manual-first / no AI.

### G6. Export and Migration

Users can export recognition rows and product library to Excel. Existing v5 JSON/image data can be imported without losing historical work.

## 4. Non-Goals for Initial Rebuild

- Full multi-tenant SaaS.
- Complex user permission system.
- Accounting reconciliation.
- Inventory management.
- Supplier/vendor management.
- Native desktop packaging.
- Training custom OCR models inside the app.
- Real-time collaborative editing.

## 5. Core Concepts

Batch:

- A work package created by upload or import.
- Contains many documents/images.
- Has aggregate status and progress.

Document:

- One uploaded image or imported image record.
- Retains source file, thumbnail, hash, metadata, and processing status.

Recognition job:

- Background unit of work for one document or one stage of extraction.
- Has status, attempts, retry/backoff, provider, model, error, timing, and cost metadata.

Extraction attempt:

- One AI/provider result for one document.
- Stores raw output reference, parsed structured data, schema version, validation result, and confidence/risk signals.

Recognition row:

- A normalized line item used for review, export, and product-library observation.

Review task:

- A row/document needing human attention due to pending status, risk, conflict, failed validation, or user filtering.

Product observation:

- A fact seen in recognition rows, such as code/name/unit/source image.

Product library item:

- Curated product master record maintained by the user.

Conflict:

- A rule-detected inconsistency such as same code with multiple names, invalid product name, code cleaned by rule, or row/library mismatch.

## 6. User Journeys

### 6.1 New Batch Recognition

1. User opens the app.
2. User creates or uses the current batch.
3. User uploads multiple JPG/PNG images.
4. System stores source images and creates document records.
5. System enqueues recognition jobs.
6. User sees batch progress: queued, processing, completed, failed, needs review.
7. System extracts date and rows using selected recognition strategy.
8. System validates rows and flags risk/conflicts.
9. User reviews flagged rows/documents.
10. User confirms rows.
11. User exports results or updates product library.

### 6.2 Review by Document

1. User opens Review Workbench.
2. Left side shows the source image with zoom/pan.
3. Right side shows rows for that document.
4. User edits fields inline.
5. User sees validation warnings next to relevant fields.
6. User confirms one row, all low-risk rows, or the whole document.
7. User navigates to next document needing review.

### 6.3 Review by Risk

1. User opens Review Queue.
2. Queue is sorted by risk level and reason.
3. User filters to date errors, arithmetic errors, product conflicts, provider disagreement, invalid names, or failed extraction.
4. User corrects and confirms rows.
5. Confirmed rows leave the review queue unless conflicts remain unresolved.

### 6.4 Product Library Rebuild and Curate

1. User opens Product Library.
2. User triggers "Rebuild observations" from current confirmed or all rows.
3. System creates/updates product observations and conflict records.
4. User reviews conflicts.
5. User edits curated product items, aliases, units, and resolution notes.
6. User can locate any conflict back to source row/document.
7. User exports the product library.

### 6.5 Retry Failed Recognition

1. User opens Batch Monitor.
2. Failed documents are visible with reason.
3. User retries one document, retry all recoverable failures, or switches provider/model.
4. System creates new extraction attempts while preserving previous attempt history.
5. User can compare attempts if needed.

### 6.6 Import Existing v5 Data

1. User opens Import.
2. User selects existing `recognition-results.json`, `image-library.json`, `product-library.json`, and optional image folder.
3. System validates files and previews counts.
4. User imports into a migration batch.
5. System preserves source rows, creates documents, rows, products, and import audit records.

## 7. Functional Requirements

### 7.1 Batch and Upload

- Create batch with name, notes, and recognition strategy.
- Upload multiple images.
- Accept JPG/JPEG/PNG at minimum.
- Store original file name, stored path, hash, file size, MIME type, width/height when available.
- Detect duplicate images by hash and warn before reprocessing.
- Generate thumbnails for document list/review.
- Allow pause/resume/cancel batch processing.
- Show batch progress and counts.

### 7.2 Recognition Queue

- Enqueue jobs for documents.
- Track job status: queued, processing, succeeded, failed, retrying, cancelled.
- Configurable concurrency.
- Configurable attempts and backoff.
- Record attempt count and last error.
- Distinguish recoverable vs unrecoverable failures.
- Manual retry for failed jobs.
- Provider-level rate-limit configuration.

### 7.3 AI Providers and Strategies

Provider settings:

- Provider name.
- Type: OpenAI-compatible, OpenAI official, custom HTTP, future cloud OCR provider.
- Base URL if applicable.
- API key reference from environment/settings.
- Model.
- Enabled/disabled.
- Priority.

Recognition strategies:

- `fast`: one attempt by primary provider.
- `balanced`: one attempt, then retry/second provider only if validation risk is high.
- `consensus`: two or more attempts for every document; disagreements become review tasks.
- `manual`: no AI extraction, user may enter rows manually or import rows.

Each attempt must store:

- Provider.
- Model.
- Prompt/schema version.
- Start/end time.
- Latency.
- Token usage/cost if available.
- Raw output reference.
- Parsed output.
- Error if failed.

### 7.4 Structured Extraction

Extracted document result must contain:

- Raw date.
- Normalized month.
- Rows array.

Each row must contain:

- Product code.
- Product name.
- Unit.
- Quantity.
- Unit price.
- Amount.
- Remark.
- Optional confidence/risk metadata.

System must validate:

- Required row shape.
- Numeric fields.
- Date parse.
- Arithmetic consistency.
- Invalid product-name dictionary.
- Product code cleaning rule.
- Product-library conflicts.
- Cross-attempt disagreement when multiple attempts exist.

### 7.5 Recognition Results Table

- Server-side pagination.
- Server-side filtering:
  - batch,
  - document,
  - month,
  - status,
  - code,
  - name,
  - risk level,
  - conflict type.
- Inline edit row fields.
- Confirm/unconfirm row.
- Delete/restore row or mark excluded.
- Bulk confirm filtered low-risk rows.
- Export filtered/all rows.
- Show audit state such as last edited time.

### 7.6 Review Workbench

- Image preview with pan, zoom, fit, reset.
- Row table for current document.
- Navigation: previous/next, next needing review, thumbnails.
- Field-level warnings and row risk reasons.
- Confirm row/document.
- Add missing row.
- Delete/exclude false-positive row.
- Compare multiple attempts when consensus/balanced produces more than one result.
- Show source row line back to document and attempt history when available.

### 7.7 Product Library

- Build observations from recognition rows.
- Maintain curated products.
- Search by code/name/unit/alias.
- Show counts and source documents.
- Detect conflicts:
  - same code, multiple names,
  - invalid name,
  - code cleaned by rule,
  - row unit differs from curated unit,
  - same name, multiple units,
  - same name, multiple codes.
- Mark conflict resolved with resolution note.
- Edit product code/name/unit/aliases.
- Locate conflict source rows/documents.
- Export library to Excel.

### 7.8 Export

Recognition export columns:

- Batch.
- Document.
- Image tag.
- Original date.
- Normalized month.
- Product code.
- Product name.
- Unit.
- Quantity.
- Unit price.
- Amount.
- Status.
- Risk/conflict indicators.
- Remark.

Product library export columns:

- Product code.
- Product name.
- Unit.
- Aliases.
- Observation count.
- Source document count.
- Conflict status.
- Conflict reason.
- First seen.
- Last seen.
- Remark.

Export records should be tracked:

- Export time.
- Type.
- Filter snapshot.
- File path/name.

### 7.9 Settings and Maintenance

- Provider settings.
- Recognition strategy defaults.
- Queue concurrency and retry policy.
- Product validation dictionary.
- Code cleaning rule.
- Export defaults.
- Backup/import entry points.
- Prompt/schema version list.

### 7.10 Audit and Safety

- Store edit history for recognition rows and products.
- Store source attempt history.
- Avoid destructive deletes by default.
- Keep source image files unless explicitly purged.
- Backup before import/migration/destructive rebuild.

## 8. Status Definitions

Batch status:

- draft
- queued
- processing
- partially_failed
- needs_review
- completed
- cancelled

Document status:

- uploaded
- queued
- processing
- extracted
- failed
- needs_review
- reviewed
- excluded

Row status:

- pending
- confirmed
- needs_review
- conflict
- excluded

Job status:

- queued
- active
- retrying
- completed
- failed
- cancelled

Conflict status:

- open
- resolved
- ignored

## 9. Success Metrics

Operational:

- Batch progress visible within 1 second after upload.
- No recognized rows lost after refresh/restart.
- Failed document can be retried without re-upload.
- Duplicate upload detection works by hash.

Review efficiency:

- User can move from one risky document to next without returning to a list.
- Bulk confirm low-risk rows is available.
- Source image and editable rows remain visible together.

Quality:

- All AI outputs must pass schema validation before becoming canonical rows.
- Every conflict can be traced to source row/document.
- Every edit is auditable.

Performance:

- 7,000+ rows must be searchable/pageable without loading all rows into a browser array.
- Large row tables should use server-side pagination or virtualization.

Maintainability:

- Typed API contracts.
- Database migrations.
- Tests for product-library conflict rules and validation rules.

## 10. Initial Release Scope

Must-have:

- Next.js App Router app shell.
- SQLite database and migration.
- Source image retention.
- Batch upload.
- Database-backed queue with bounded worker concurrency.
- OpenAI-compatible provider.
- Structured schema extraction.
- Fast and balanced strategies.
- Results table.
- Review workbench.
- Product library and conflict detection.
- Excel export.
- v5 JSON import.

Should-have:

- Consensus strategy with attempt comparison.
- Provider switching per retry.
- Export history.
- Product aliases.
- Audit log UI.

Later:

- Redis/BullMQ worker mode.
- PostgreSQL deployment.
- User accounts/roles.
- Cloud object storage.
- Dedicated cloud OCR providers such as Azure Document Intelligence, Google Document AI, AWS Textract.

## 11. Open Decisions for Confirmation

1. Should the first implementation use SQLite even though `super-dev.yaml` currently says PostgreSQL? Recommendation: yes, use SQLite first and document PostgreSQL as a future migration target.
2. Should product library rebuild use only confirmed rows by default? Recommendation: yes, default to confirmed rows, with an explicit option to include pending rows.
3. Should balanced mode be default? Recommendation: yes, because it controls cost while improving reliability on risky cases.
4. Should images be copied into the new app's managed storage during v5 import? Recommendation: yes, so review remains stable.
