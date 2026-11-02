# Spec Delta

## Purpose

Defines frontend-only behavior for the single-page catalog/watchlist/webhook UI that isn't dictated by the backend API capabilities it consumes.

## ADDED Requirements

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
