# web-ui Specification

## Purpose
Defines frontend-only behavior for the single-page catalog/watchlist/webhook UI that isn't dictated by the backend API capabilities it consumes.

## Requirements

### Requirement: Catalog filter selections persist across a page reload
The page SHALL reflect the current catalog filter selections (free-text search, region, availability, datacenters, memory sizes, storage substring) in the browser URL as they change, and SHALL restore them from the URL on page load instead of always starting from hard-coded defaults.

#### Scenario: Reloading after narrowing the catalog
- **WHEN** a user selects memory sizes, a storage substring, and/or other filters, then reloads the page
- **THEN** the same filters are pre-applied (including checkboxes pre-checked) and the catalog table shows the same narrowed results, instead of reverting to the default view

#### Scenario: Fresh visit with no query string
- **WHEN** a user opens the page with no query string
- **THEN** the page falls back to its default filters (availability: available only, no other filters applied)

#### Scenario: Resetting filters clears the URL
- **WHEN** a user clicks "Reset"
- **THEN** the filter selections return to their defaults and the URL query string is cleared to match

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

### Requirement: Catalog table reflects only the most recent filter request
The page SHALL ensure the catalog table only ever reflects the response to the most recently issued `/api/catalog` request. A response to an earlier, superseded request SHALL be discarded if it arrives after a newer request has already been issued, even if it resolves later.

#### Scenario: A slower, broader request resolves after a faster, narrower one
- **WHEN** a user changes filters twice in quick succession (e.g. broadens then narrows, or vice versa) such that the first request's response would arrive after the second's
- **THEN** the table reflects only the second (most recent) filter state's results, never the first's

#### Scenario: Normal single-filter-change flow is unaffected
- **WHEN** a user changes a filter and no other request is in flight
- **THEN** the table updates normally with that request's results
