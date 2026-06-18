## Context

The settings module currently stores `AiProviderConfig.model` on the provider row, so one provider credential/base URL can only represent one model. Operators who want to use two models from the same OpenAI-compatible provider must duplicate the provider row and repeat credentials, which makes primary/secondary/audit routing harder to reason about.

The project is still in development, so database tables can be changed to fit the business model. Per project convention, table relationships must not use cascading behavior; cleanup and fallback behavior should live in application code.

## Goals / Non-Goals

**Goals:**

- Represent one AI provider with many model options.
- Import model options from an OpenAI-compatible models endpoint derived from the provider Base URL.
- Keep import best-effort: failed imports leave the existing provider and model catalog unchanged.
- Let recognition defaults, batch overrides, provider tests, and worker calls select an exact provider/model pair.
- Preserve recognition attempt metadata as `providerKey` plus concrete `model`.

**Non-Goals:**

- Add a custom per-provider model-list URL setting.
- Implement provider-specific model capability classification beyond storing imported metadata.
- Delete stale provider models automatically when an import response omits them.
- Add cascading database deletes between providers, models, batches, or attempts.

## Decisions

### Split provider credentials from provider models

Add an `AiProviderModel` table owned by `AiProviderConfig`. Provider rows keep credential, protocol, Base URL, enablement, priority, token limits, temperature, prompts, and metadata. Model rows store `modelId`, display name, enabled state, priority, source (`manual` or `imported`), provider-returned metadata JSON, and timestamps.

The Prisma relation must explicitly use non-cascading behavior, such as `onDelete: Restrict`, or rely on the database default where it is non-cascading. Deleting a provider with models should be blocked or handled by application code; disabling is the normal operational path.

Alternative considered: keep one provider row per model. That duplicates API keys and Base URLs and does not match the user's provider mental model.

### Store selections as provider key plus model id

Defaults and batches should resolve to a provider/model pair, not just a provider. Add model id fields beside existing provider key fields:

- Defaults: `primaryProviderKey`, `primaryModelId`, `secondaryProviderKey`, `secondaryModelId`, `auditProviderKey`, `auditModelId`.
- Batch overrides: `primaryProviderKey`, `primaryModelId`, `secondaryProviderKey`, `secondaryModelId`.

This keeps persisted selections human-readable and avoids using database row IDs in long-lived settings. If a model id is missing for an existing provider-key-only selection, resolution uses that provider's first enabled model by priority. If the selected model is disabled or missing, resolution falls back to the next enabled model.

Alternative considered: store `AiProviderModel.id` in settings and batches. That is simpler to query but makes settings less portable and more fragile across seed/reset/import flows.

### Derive the OpenAI-compatible models endpoint by convention

For `openai_responses` providers, implement a helper that derives the models endpoint from Base URL without adding a new setting:

- Trim trailing slashes.
- If the path already ends with `/v1`, call `<baseUrl>/models`.
- Otherwise call `<baseUrl>/v1/models`.

The request uses the provider API key as a bearer token and accepts the OpenAI-compatible shape `{ data: [{ id: string, ... }] }`. It may also tolerate string entries in `data` if a compatible provider returns a simplified list. If the endpoint is unreachable, unauthorized, times out, or returns an unsupported shape, the import action reports the failure and makes no catalog changes.

Alternative considered: expose an import URL field. That adds configuration surface before there is evidence the convention is insufficient.

### Make imports idempotent and non-destructive

Import upserts by `(providerId, modelId)`. Existing rows keep user-edited fields such as enabled state and priority unless the field is strictly import-owned metadata. New rows default to enabled with imported source metadata. The import does not delete or disable existing rows that are absent from the provider response.

Alternative considered: replace the whole provider model catalog on every import. That risks removing manually added or temporarily hidden models.

### Route recognition through a resolved target

Replace the internal assumption that `AiProviderConfig` contains the selected model with a resolved recognition target:

```ts
type RecognitionTarget = {
  provider: AiProviderConfig
  model: AiProviderModel
}
```

`createRecognitionProvider` receives the provider config plus selected `model.modelId`. Provider prompts and API limits remain provider-level. Worker attempt records continue to write `providerKey` and the actual model id so review screens and audit history remain readable.

## Risks / Trade-offs

- Non-standard providers may not support the derived models endpoint -> keep manual model creation/editing and show an import failure without changing existing rows.
- Imported model lists may contain models that do not support vision or structured output -> allow per-model testing and enable/disable controls; future capability tags can be added to model metadata.
- Defaults that reference removed models can drift -> resolution must validate enabled provider/model pairs and fall back deterministically by priority.
- Large provider catalogs may clutter settings -> keep model rows compact and sortable now; add filtering later if needed.
- Migration can strand old provider-only selections -> seed one model row from each existing `AiProviderConfig.model` and preserve provider-key-only fallback during parsing.

## Migration Plan

1. Add `AiProviderModel` without cascade relationships and migrate existing `AiProviderConfig.model` values into one model row per provider.
2. Add batch model override columns and extend the recognition defaults JSON parser/writer to include primary, secondary, and audit model ids while accepting old provider-key-only data.
3. Update settings APIs to return provider rows with nested model rows and to upsert provider/model data without deleting omitted models.
4. Add the model import endpoint and endpoint-derivation helper for OpenAI-compatible providers.
5. Update recognition provider construction, provider testing, batch creation, worker resolution, and review metadata to use resolved provider/model targets.
6. Update settings UI, seed data, README, and tests.

Rollback during development can reset the local database or reverse the migration. Since no cascade behavior is introduced, rollback cleanup must delete dependent model rows explicitly before deleting provider rows.

## Open Questions

- Should imported models default to enabled, or should the UI require explicit enablement after import? The proposed default is enabled to make import immediately useful.
- Should Anthropic model import be added later through a provider-specific endpoint if their API surface diverges from OpenAI-compatible `/v1/models`?
