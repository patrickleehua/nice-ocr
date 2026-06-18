## Why

The current AI provider configuration treats one provider as one model, which forces users to duplicate provider credentials and endpoints whenever the same provider exposes multiple usable models. Many OpenAI-compatible providers expose a `/v1/models` endpoint, so the system should let operators import and manage multiple model options under a single provider.

## What Changes

- Add first-class provider model management so one provider can own multiple selectable models.
- Add model import for OpenAI-compatible providers by deriving a models endpoint from the provider Base URL and calling the provider's `/v1/models`-compatible API.
- Keep model import best-effort: if the endpoint cannot be reached or returns an unsupported shape, the provider remains editable and no models are imported.
- Update settings UI so operators can import models, see provider-owned model options, choose defaults, and select provider/model pairs for primary, secondary, and audit recognition.
- Update recognition resolution so jobs run against a specific provider model instead of assuming the provider row's single model field.
- **BREAKING**: Provider selection keys used by recognition defaults and batches must be migrated to provider/model selection semantics.

## Capabilities

### New Capabilities
- `provider-model-catalog`: Manage multiple model options per AI provider and import OpenAI-compatible model lists.

### Modified Capabilities

None.

## Impact

- Prisma schema and migrations for separating provider configuration from provider-owned models.
- Settings API contracts, validation, and provider test/import endpoints.
- Recognition settings resolution, batch defaults, worker calls, and attempt metadata.
- Settings UI provider cards and primary/secondary/audit selectors.
- Seed data, README, and focused tests for model import, selection, migration, and recognition routing.
