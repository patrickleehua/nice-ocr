## ADDED Requirements

### Requirement: Provider owns multiple model options
The system SHALL allow each AI provider to own zero or more model options, and SHALL store model options separately from provider credentials, protocol, Base URL, prompts, and enablement.

#### Scenario: Multiple models under one provider
- **WHEN** an operator configures one provider with model options `gpt-4.1` and `gpt-4.1-mini`
- **THEN** the system persists one provider configuration and two provider-owned model options

#### Scenario: Provider credentials are not duplicated per model
- **WHEN** an operator edits the API key or Base URL for a provider with multiple model options
- **THEN** the change applies to the provider and all model options continue to use that provider configuration

### Requirement: Manual model management
The system SHALL allow operators to manually add, edit, enable, disable, and prioritize model options for a provider.

#### Scenario: Add a manual model
- **WHEN** an operator adds a model id to an existing provider and saves settings
- **THEN** the model appears as a selectable option for that provider

#### Scenario: Disabled model is not selected automatically
- **WHEN** a provider has both enabled and disabled model options
- **THEN** automatic recognition selection only considers enabled model options

### Requirement: OpenAI-compatible model import
The system SHALL provide a model import action for OpenAI-compatible providers that calls a models endpoint derived from the provider Base URL by convention.

#### Scenario: Base URL already includes v1
- **WHEN** an OpenAI-compatible provider has Base URL `https://api.example.com/v1`
- **THEN** model import calls `https://api.example.com/v1/models`

#### Scenario: Base URL does not include v1
- **WHEN** an OpenAI-compatible provider has Base URL `https://api.example.com`
- **THEN** model import calls `https://api.example.com/v1/models`

#### Scenario: Import supported response
- **WHEN** the derived models endpoint returns an OpenAI-compatible response containing model ids
- **THEN** the system upserts those ids as provider-owned model options and reports the number imported

#### Scenario: Import unavailable endpoint
- **WHEN** the derived models endpoint is unreachable, unauthorized, times out, or returns an unsupported response
- **THEN** the system reports the import failure and does not modify the existing model catalog

### Requirement: Model import is idempotent and non-destructive
The system SHALL upsert imported model options without deleting or disabling existing model options that are absent from the latest import response.

#### Scenario: Re-import existing models
- **WHEN** an operator imports models twice from the same provider and the response contains an existing model id
- **THEN** the system updates import-owned metadata for the existing model instead of creating a duplicate

#### Scenario: Preserve manually added models
- **WHEN** an imported response omits a manually added model option
- **THEN** the manually added model option remains available with its current enabled state and priority

### Requirement: Recognition selects provider model pairs
The system SHALL resolve primary, secondary, and audit recognition choices as provider/model pairs.

#### Scenario: Defaults select two models from the same provider
- **WHEN** the global primary selection is provider `p1` model `m1` and the global secondary selection is provider `p1` model `m2`
- **THEN** two-pass recognition uses `p1/m1` for pass 1 and `p1/m2` for pass 2

#### Scenario: Batch overrides default model selection
- **WHEN** a batch specifies a primary provider/model pair
- **THEN** recognition for that batch uses the batch primary pair instead of the global primary pair

#### Scenario: Missing selected model falls back
- **WHEN** a stored selection references a missing or disabled model
- **THEN** the resolver falls back to the selected provider's first enabled model by priority, or to the first enabled provider/model pair if the provider cannot be used

#### Scenario: Attempt metadata records concrete model
- **WHEN** a recognition pass completes
- **THEN** the extraction attempt records the provider key and the concrete model id used for the provider call

### Requirement: Provider test uses selected model
The system SHALL test a provider connection against a specific provider-owned model option.

#### Scenario: Test chosen model
- **WHEN** an operator tests provider `p1` model `m2`
- **THEN** the system calls provider `p1` using model id `m2` and reports success or failure for that pair

#### Scenario: Test unavailable model
- **WHEN** an operator tests a provider model that does not belong to the provider
- **THEN** the system rejects the request without calling the external provider

### Requirement: No cascading table relationships
The system SHALL NOT introduce cascading delete or update relationships for provider model tables.

#### Scenario: Delete provider with models
- **WHEN** provider model rows exist for a provider
- **THEN** deleting the provider is blocked or handled explicitly by application code rather than by a database cascade
