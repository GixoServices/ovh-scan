# Spec Delta

## ADDED Requirements

### Requirement: Catalog table reflects only the most recent filter request
The page SHALL ensure the catalog table only ever reflects the response to the most recently issued `/api/catalog` request. A response to an earlier, superseded request SHALL be discarded if it arrives after a newer request has already been issued, even if it resolves later.

#### Scenario: A slower, broader request resolves after a faster, narrower one
- **WHEN** a user changes filters twice in quick succession (e.g. broadens then narrows, or vice versa) such that the first request's response would arrive after the second's
- **THEN** the table reflects only the second (most recent) filter state's results, never the first's

#### Scenario: Normal single-filter-change flow is unaffected
- **WHEN** a user changes a filter and no other request is in flight
- **THEN** the table updates normally with that request's results
