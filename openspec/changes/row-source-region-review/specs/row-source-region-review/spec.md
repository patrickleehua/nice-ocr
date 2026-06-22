## ADDED Requirements

### Requirement: Recognition rows store source regions
The system SHALL store an optional source region for each recognition row, representing the row's approximate location on the original document image.

#### Scenario: New recognition row has a source region
- **WHEN** a recognition model returns a valid row-level source region
- **THEN** the system stores that region with the corresponding recognition row

#### Scenario: Missing source region is accepted
- **WHEN** a recognition model omits a source region for a row
- **THEN** the system still stores the recognition row and leaves its source region empty

#### Scenario: Invalid source region is ignored
- **WHEN** a recognition model returns an invalid source region
- **THEN** the system does not fail the recognition job and stores the row without a source region

### Requirement: Source regions use normalized image coordinates
The system SHALL represent source regions using normalized image coordinates so they remain valid across image display sizes and zoom levels.

#### Scenario: Region maps to displayed image
- **WHEN** the original image is displayed at any rendered size
- **THEN** a stored normalized region maps to the correct proportional area of the displayed image

#### Scenario: Region survives zoom and pan
- **WHEN** an operator zooms or pans the image viewer
- **THEN** the displayed source region remains aligned with the image content

### Requirement: Review rows highlight their source image area
The review workspace SHALL let operators visually locate a recognition row on the original image.

#### Scenario: Hover row highlights image area
- **WHEN** an operator hovers over a recognition row that has a source region
- **THEN** the image viewer highlights that row's region without moving the viewport

#### Scenario: Locate row moves image to region
- **WHEN** an operator activates locate for a recognition row with a source region
- **THEN** the image viewer pans and zooms as needed to bring that region into view

#### Scenario: Row without source region has no locate action
- **WHEN** a recognition row has no source region
- **THEN** the review workspace does not offer an active locate action for that row

### Requirement: Image source regions select review rows
The review workspace SHALL support selecting a recognition row from the highlighted image region.

#### Scenario: Click image region selects row
- **WHEN** an operator clicks a displayed source region in the image viewer
- **THEN** the corresponding recognition row becomes highlighted in the review table

#### Scenario: Selected image region scrolls table
- **WHEN** the corresponding recognition row is outside the visible table area
- **THEN** the review table scrolls that row into view

### Requirement: Existing data degrades gracefully
The system SHALL preserve the existing review workflow for documents and rows that do not have stored source regions.

#### Scenario: Old document opens normally
- **WHEN** an operator opens a document whose rows have no source regions
- **THEN** the image viewer and review table remain usable with the existing zoom, pan, edit, and confirm actions

#### Scenario: Mixed rows are supported
- **WHEN** a document contains some rows with source regions and some rows without source regions
- **THEN** rows with regions support highlighting and locate, while rows without regions continue to behave normally
