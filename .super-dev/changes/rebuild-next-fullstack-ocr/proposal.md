# Change Proposal: rebuild-next-fullstack-ocr

## Summary

Rebuild the current v5 image table recognition tool as a maintainable Next.js full-stack application. Preserve the existing business loop while adding durable SQLite persistence, background recognition jobs, retryable AI extraction, product-library conflict management, and a UI aligned with the approved `output/uiux.png` reference.

## Background

The existing v5 implementation in `docs/v5_new_3 2` proves the business need:

- Upload single-document images.
- Extract table rows with a vision-capable AI model.
- Edit and confirm recognition rows.
- Review by image.
- Export recognition rows.
- Build and inspect a副食品资料库.

The current system is fragile because it uses in-memory frontend arrays plus JSON file overwrite, processes recognition serially without durable jobs/retries, hardcodes a single AI provider/model, and has limited long-term maintainability.

## Goals

- Build a Next.js App Router application in `nice-ocr/`.
- Use SQLite with Prisma for durable local-first storage.
- Store original images and attempt outputs in managed local storage.
- Model batches, documents, recognition jobs, extraction attempts, rows, products, conflicts, exports, settings, and audit logs.
- Add a database-backed queue and worker for bounded concurrent recognition.
- Add provider abstraction with OpenAI-compatible provider first.
- Support fast, balanced, consensus, and manual recognition strategies in the data model/UI.
- Implement frontend-first screens using shadcn-style components, Tailwind, TanStack tables, TanStack Query, and Lucide icons.
- Provide migration/import from v5 JSON files and image folders.
- Add validation and conflict-detection rules inherited from v5.

## Non-Goals

- Multi-tenant SaaS.
- Full role-based authentication.
- Cloud object storage.
- Redis/BullMQ production queue.
- Dedicated Azure/Google/AWS OCR providers in the first implementation.
- Custom model training.

## Approved Documents

- `output/nice-ocr-research.md`
- `output/nice-ocr-prd.md`
- `output/nice-ocr-architecture.md`
- `output/nice-ocr-uiux.md`
- `output/uiux.png`

## UX Direction

Follow `output/uiux.png`:

- Dark left sidebar.
- Compact operational dashboard.
- Dense data tables.
- Right-side drawers/dialogs for transactional actions.
- Split review workspace with image viewer and editable rows.
- Status badges and risk indicators.
- No emoji icons; use Lucide.

## Risks

- SQLite write contention if worker concurrency is too high.
- Next.js server/runtime APIs must remain Node-compatible for Prisma/filesystem.
- AI provider calls may be slow, flaky, or expensive.
- Product library semantics need clear separation between observations and curated products.
- The UI may become too dense if responsive behavior is not carefully managed.

## Acceptance Criteria

- App builds with `pnpm build`.
- Lint has no errors.
- UI code contains no emoji characters.
- The first frontend preview implements the approved app shell and core operational pages.
- SQLite schema and migration exist before backend integration.
- Recognition jobs are persisted and retryable.
- v5 import path exists for JSON data.
- Existing v5 business workflows remain represented: upload, recognize, review, edit, confirm, export, product library, conflicts.
