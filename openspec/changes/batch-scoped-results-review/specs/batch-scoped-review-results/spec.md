## ADDED Requirements

### Requirement: Unified batch scope selector
The system SHALL provide a batch scope selector on both the results page and the review workspace, offering "All" plus every batch as options, defaulting to "All".

#### Scenario: Default scope is all batches
- **WHEN** an operator opens the results page or the review workspace without a batch in the URL
- **THEN** the scope selector shows "All" selected and the view spans all batches

#### Scenario: Select a batch to isolate
- **WHEN** an operator selects a specific batch in the scope selector
- **THEN** the view shows only that batch's data and the URL carries that batch id

#### Scenario: Return to all
- **WHEN** an operator selects "All" in the scope selector while a batch is selected
- **THEN** the view returns to spanning all batches and the batch id is removed from the URL

### Requirement: Scope persists across results and review
The system SHALL carry the selected batch scope between the results page and the review workspace through the URL so switching between them preserves the scope.

#### Scenario: Switch tabs keeps the batch
- **WHEN** an operator has batch `b1` selected on the results page and navigates to the review workspace via the batch workspace navigation
- **THEN** the review workspace opens scoped to batch `b1`

#### Scenario: Isolated scope shows workspace navigation
- **WHEN** a specific batch is selected on either page
- **THEN** the batch workspace navigation bar is shown for that batch

### Requirement: Cross-batch review worklist
The system SHALL let the review workspace operate across all batches when scope is "All", listing pending documents from every batch with their owning batch identified.

#### Scenario: All-scope lists documents from every batch
- **WHEN** an operator opens the review workspace with scope "All"
- **THEN** the document list contains documents drawn from multiple batches, each labeled with its owning batch

#### Scenario: Document list filters by review state
- **WHEN** an operator filters the all-scope document list by review state "pending"
- **THEN** only documents whose review state is pending are listed, regardless of batch

#### Scenario: Isolated scope lists one batch
- **WHEN** an operator selects a specific batch in the review workspace
- **THEN** the document list contains only that batch's documents

#### Scenario: Navigation iterates the current list
- **WHEN** an operator uses previous/next (or focus-mode arrow keys) in either scope
- **THEN** navigation moves within the currently filtered document list

### Requirement: Isolation applies batch workspace context
The system SHALL treat selecting a specific batch as entering that batch's workspace context for data, field columns, and export defaults.

#### Scenario: Isolated results use batch export template
- **WHEN** an operator selects a batch on the results page and opens export
- **THEN** the export defaults to that batch's bound export template

#### Scenario: Isolated columns use batch scenario
- **WHEN** an operator selects a batch whose scenario differs from the global active scenario
- **THEN** the results table and review detail render the columns of that batch's scenario

### Requirement: Scope-aware field column resolution
The system SHALL resolve field columns by the active scope without mutating the global active scenario.

#### Scenario: Fields by scenario without switching global
- **WHEN** field definitions are requested for a specific scenario id
- **THEN** the system returns that scenario's fields and the global active scenario is unchanged

#### Scenario: Review detail follows the document's batch scenario
- **WHEN** an operator opens a document in the all-scope review worklist
- **THEN** the detail table renders the columns of the scenario belonging to that document's batch

### Requirement: Mixed-scenario results degrade to common columns
The system SHALL adapt the all-scope results table columns to the scenarios present in the current result set.

#### Scenario: Single scenario shows full columns
- **WHEN** the all-scope results set contains rows from batches that all share one scenario
- **THEN** the results table renders that scenario's full column set

#### Scenario: Multiple scenarios degrade and notify
- **WHEN** the all-scope results set contains rows from batches with two or more different scenarios
- **THEN** the results table renders only the common core columns and shows a notice that extension columns are hidden and a specific batch should be selected to see full columns
