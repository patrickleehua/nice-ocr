## 1. Data Model and Migration

- [ ] 1.1 Add an `AiProviderModel` Prisma model with provider ownership, model id, display name, enabled state, priority, source, metadata JSON, timestamps, unique `(providerId, modelId)`, and no cascade relationship.
- [ ] 1.2 Add batch-level model override columns for primary and secondary selections.
- [ ] 1.3 Migrate existing `AiProviderConfig.model` values into initial provider model rows and preserve attempt metadata fields.
- [ ] 1.4 Update seed data so default providers each have at least one provider-owned model option.
- [ ] 1.5 Regenerate Prisma client and verify the schema contains no cascade relationships.

## 2. Settings Services and API

- [ ] 2.1 Update settings payload types to return providers with nested model options and model-aware defaults.
- [ ] 2.2 Update provider upsert logic so provider fields and model rows are validated and saved separately without deleting omitted models.
- [ ] 2.3 Extend recognition defaults parsing/writing with primary, secondary, and audit model ids while remaining compatible with existing provider-key-only settings.
- [ ] 2.4 Add helper logic to derive OpenAI-compatible model import endpoints from provider Base URL by convention.
- [ ] 2.5 Add a provider model import API endpoint that fetches `/v1/models`-compatible responses, upserts models idempotently, and leaves catalogs unchanged on failure.
- [ ] 2.6 Update provider test API to accept a provider model id and reject tests for models that do not belong to the provider.

## 3. Recognition Routing

- [ ] 3.1 Introduce a resolved recognition target type containing provider config plus selected provider model.
- [ ] 3.2 Update active provider/model resolution to choose enabled provider/model pairs by batch override, global defaults, and priority fallback.
- [ ] 3.3 Update recognition provider constructors so external calls use the selected model id rather than a provider-level model field.
- [ ] 3.4 Update worker primary, secondary, and audit flows to pass resolved targets and record the concrete model id on attempts.
- [ ] 3.5 Update batch creation and retry/audit endpoints to preserve or resolve provider/model pair selections correctly.

## 4. Settings UI

- [ ] 4.1 Refactor settings provider cards so provider-level fields are separate from model option rows.
- [ ] 4.2 Add controls to add, edit, enable, disable, prioritize, test, and import provider model options.
- [ ] 4.3 Update primary, secondary, and audit selectors to choose provider/model pairs, including two models from the same provider.
- [ ] 4.4 Show import success and failure states without discarding unsaved provider edits.
- [ ] 4.5 Verify the settings UI on desktop and mobile viewports.

## 5. Tests and Documentation

- [ ] 5.1 Add unit tests for model endpoint derivation and import response parsing/failure behavior.
- [ ] 5.2 Add integration tests for settings save, idempotent import, manual model preservation, and no duplicate model rows.
- [ ] 5.3 Add recognition resolution tests for same-provider two-model selection, batch override, missing model fallback, and attempt metadata.
- [ ] 5.4 Update README provider configuration notes to describe provider-owned models and `/v1/models` import behavior.
- [ ] 5.5 Run the existing test suite and relevant lint/type checks.
