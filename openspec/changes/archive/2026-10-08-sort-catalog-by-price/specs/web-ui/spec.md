# Spec Delta

## ADDED Requirements

### Requirement: Sort the catalog table by price
The page SHALL let a user sort the displayed catalog rows by computed monthly price, ascending or descending, by clicking the "Price / mo" column header. Rows with no computable price SHALL always be placed after all priced rows, regardless of sort direction. The current sort state SHALL be reflected in the URL alongside the filter state, and restored on page load.

#### Scenario: Sorting ascending
- **WHEN** a user clicks the "Price / mo" header once
- **THEN** the displayed rows are ordered from lowest to highest price, with unpriced rows at the end

#### Scenario: Toggling to descending
- **WHEN** a user clicks the "Price / mo" header again
- **THEN** the displayed rows are ordered from highest to lowest price, with unpriced rows still at the end

#### Scenario: Reloading preserves the sort
- **WHEN** a user has sorted by price and reloads the page
- **THEN** the same sort order is re-applied without the user needing to click the header again
