# Tasks: rebuild-next-fullstack-ocr

## 1. Spec and Gates

- [x] Confirm core research/PRD/architecture/UIUX documents.
- [x] Ingest `output/uiux.png` as visual implementation reference.
- [x] Create change proposal and task list.
- [x] Complete coding preflight: dependency versions, official docs, project config, UI toolchain declaration.

## 2. Frontend First

- [x] Add required frontend dependencies.
- [x] Establish design tokens and global styles.
- [x] Create app shell with dark sidebar and top operation bar.
- [x] Create shared UI primitives using shadcn-style composition and Lucide icons.
- [x] Create mock/domain types for batches, documents, rows, products, conflicts, jobs, attempts.
- [x] Implement Dashboard page.
- [x] Implement Batches list page.
- [x] Implement Batch detail page.
- [x] Implement Results table page.
- [x] Implement Review Workbench page.
- [x] Implement Products page.
- [x] Implement Conflicts page.
- [x] Implement Import page.
- [x] Implement Settings page.
- [x] Implement common drawers/dialogs: create batch, edit row, confirm action, risk details.
- [x] Run frontend build/lint/runtime smoke.
- [ ] Stop for preview confirmation.

## 3. Backend and Data

- [x] Add Prisma and SQLite setup.
- [x] Define schema for batches, documents, jobs, attempts, rows, observations, products, conflicts, exports, settings, audit logs.
- [x] Add database client and seed/dev data.
- [x] Add file storage helpers.
- [x] Add v5 import service.
- [x] Add validation service: date, amount, product name, code cleaning, risk reasons.
- [x] Add product-library rebuild/conflict service.
- [x] Add export service.

## 4. Queue and AI

- [x] Add database-backed queue service.
- [x] Add worker claim/retry/backoff lifecycle.
- [x] Add provider interface.
- [x] Add database-backed AI provider configuration.
- [x] Add OpenAI Responses provider through the official OpenAI SDK.
- [x] Add Anthropic Messages provider through the official Anthropic SDK.
- [x] Add structured extraction schema.
- [x] Add fast/balanced strategy flow.
- [x] Persist extraction attempts and raw output.
- [x] Surface job and provider status in UI.

## 5. API Integration

- [x] Add batch APIs.
- [x] Add upload APIs.
- [x] Add document APIs.
- [x] Add row APIs.
- [x] Add product/conflict APIs.
- [x] Add export APIs.
- [x] Add import APIs.
- [x] Replace frontend mock data with API-backed queries/mutations.

## 6. Quality

- [x] Unit tests for validation and product conflict rules.
- [x] Integration tests for import, queue, row edit, product rebuild, export.
- [x] Build passes.
- [x] Lint passes.
- [x] Runtime smoke passes.
- [x] Source scan confirms no emoji UI icons.
- [x] Delivery proof-pack summarized.
