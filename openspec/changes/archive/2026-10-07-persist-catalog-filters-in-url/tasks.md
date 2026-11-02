# Tasks

## 1. Frontend

- [x] 1.1 Add `restoreFiltersFromUrl()`: parse `window.location.search` into the filter inputs' values and into `state.selectedDatacenters`/`state.selectedMemorySizes`, run it before the first `loadFacets()`/`loadCatalog()` call in `init()`
- [x] 1.2 Add `updateUrlFromFilters()`: build the query string via the existing `buildQuery()` and apply it with `history.replaceState`, called at the start of `loadCatalog()` so every filter-triggering action (search input, selects, checkboxes, reset) keeps the URL in sync
- [x] 1.3 Verify manually: set a combination of filters (e.g. memory 32/64 + storage "nvme"), reload the page, confirm the same filters are shown pre-applied and the table matches; then click Reset and confirm the URL query string clears
